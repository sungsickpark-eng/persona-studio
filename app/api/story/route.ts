import { NextResponse } from "next/server";
import {
  relationLabel,
  type Fact,
  type Group,
  type LLMSettings,
  type Persona,
  type PersonaGroupRelation,
  type Relation,
  VIEWPOINT_LABEL,
  type Viewpoint,
  type ViewpointMode,
  type World,
} from "@/lib/store";
import { callLLM, llmConnectErrorMessage } from "@/lib/llm";

// 서술자 역할 소개 — 시점에 따라 "전지적 작가다"라는 기존 문구를 그대로 못 쓰므로 모드별로 다르게 소개한다
function narratorRoleLabel(mode: ViewpointMode): string {
  switch (mode) {
    case "thirdObserver":
      return "이 세계를 3인칭 관찰자 시점으로 지켜보며 글을 쓰는 서술자";
    case "firstProtagonist":
      return "이야기 속 한 인물의 1인칭 시점으로 글을 쓰는 서술자";
    case "firstObserver":
      return "이야기를 곁에서 지켜보는 관찰자 인물의 1인칭 시점으로 글을 쓰는 서술자";
    default:
      return "다음 세계관과 등장인물 전체를 총괄하는 전지적 작가";
  }
}

// 시점별 서술 제약을 프롬프트에 덧붙인다. 자료(context) 자체는 모든 시점에 동일하게 전달하고(작가는 설정 전체를 알아야
// 일관되게 쓸 수 있으므로), "무엇을 아는가"가 아니라 "무엇을 직접 서술로 드러낼 수 있는가"만 시점별로 제약한다.
// firstProtagonist/firstObserver인데 서술자가 지정 안 됐으면 안전하게 전지적 작가로 취급(빈 문자열 반환)
function viewpointInstruction(viewpoint: Viewpoint | undefined, personas: Persona[]): string {
  const mode = viewpoint?.mode ?? "omniscient";
  if (mode === "omniscient") return "";
  if (mode === "thirdObserver") {
    return "\n\n# 시점 제약: 3인칭 관찰자 시점\n인물의 속마음·생각·감정을 직접 서술하지 마라. 오직 대사, 행동, 표정, 몸짓, 상황 묘사로만 써서 독자가 인물의 감정을 스스로 짐작하게 하라.";
  }
  const narrator = personas.find((p) => p.id === viewpoint?.narratorPersonaId);
  if (!narrator) return "";
  if (mode === "firstProtagonist") {
    return `\n\n# 시점 제약: 1인칭 주인공 시점 (서술자: ${narrator.name})\n반드시 "나는..."처럼 ${narrator.name} 본인의 1인칭 시점으로 서술하라. ${narrator.name} 자신의 생각과 감정만 직접 서술할 수 있다. 다른 인물의 속마음은 절대 알 수 없으므로 겉으로 드러나는 말과 행동만으로 짐작해서 표현하라. ${narrator.name}이 그 자리에 없어서 알 수 없는 사건은 서술하지 마라(나중에 전해 들은 것이 아니라면).`;
  }
  return `\n\n# 시점 제약: 1인칭 관찰자 시점 (서술자: ${narrator.name})\n주인공이 아닌 주변 인물 ${narrator.name}의 1인칭 시점("나는...")으로 서술하라. ${narrator.name} 자신의 생각과 감정만 직접 서술할 수 있고, 다른 인물(특히 이야기의 중심 인물)의 속마음은 알 수 없으므로 겉으로 드러나는 모습만 묘사하라. ${narrator.name}이 직접 보거나 듣지 못한 사건은 서술하지 마라.`;
}

// 인터뷰용 buildSystemPrompt와 달리, 특정 캐릭터의 정보 비대칭을 걸러내지 않고 프로젝트 전체를 그대로 요약한다
// (전지적 작가는 모든 인물·집단·관계·사실을 다 안다는 전제)
function buildWorldContext(
  world: World,
  personas: Persona[],
  groups: Group[],
  personaRelations: Relation[],
  groupRelations: Relation[],
  personaGroupRelations: PersonaGroupRelation[],
  facts: Fact[],
): string {
  const nameOfPersona = (id: string) => personas.find((p) => p.id === id)?.name ?? "?";
  const nameOfGroup = (id: string) => groups.find((g) => g.id === id)?.name ?? "?";

  const personaBlocks =
    personas
      .map((per) => {
        const myGroups = groups.filter((g) => g.memberIds.includes(per.id)).map((g) => g.name);
        // 이 인물이 실제로 아는/오해하는 사실 — 이게 없으면 전지적 작가도, 설정 충돌 검사도 "이 인물이 이 사실을 알아도 되는지"를
        // 판단할 근거가 없어서 검사 단계가 애매한 정황만으로 충돌을 추측(오탐)하게 됨. 아래 실제 사실 목록과 대조할 명확한 기준을 준다
        const known = facts.filter((f) => f.access[per.id]?.status === "knows").map((f) => f.content);
        const misbeliefs = facts
          .map((f) => f.access[per.id])
          .filter((a): a is { status: "misbelieves"; misbelief: string } => a?.status === "misbelieves")
          .map((a) => a.misbelief);
        return `- ${per.name} (나이: ${per.age || "미정"}, 직업: ${per.occupation || "미정"})
  외형: ${per.appearance || "미정"}
  성격: ${per.personality || "미정"} / 가치관: ${per.values || "미정"} / 말투: ${per.speech || "미정"}
  배경 서사: ${per.backstory || "미정"}
  현재 목표: ${per.goals || "미정"} / 과거 지향: ${per.past || "미정"} / 현재 지향: ${per.present || "미정"} / 미래 지향: ${per.future || "미정"}
  금기/트리거: ${per.triggers || "미정"}
  소속: ${myGroups.length ? myGroups.join(", ") : "무소속"}
  이 인물이 아는 사실(아래 목록에 없는 실제 사실은 이 인물이 모른다): ${known.length ? known.join(" / ") : "(없음 — 아무 사실도 모름)"}
  이 인물이 진실이라 믿는 오해(실제와 달라도 본인은 이렇게 믿음): ${misbeliefs.length ? misbeliefs.join(" / ") : "(없음)"}`;
      })
      .join("\n") || "(없음)";

  const groupBlocks =
    groups
      .map((g) => {
        const members = g.memberIds.map(nameOfPersona);
        const parent = g.parentId ? nameOfGroup(g.parentId) : null;
        return `- ${g.name}: ${g.description || "(설명 없음)"}\n  구성원: ${members.length ? members.join(", ") : "없음"}${parent ? `\n  상위 집단: ${parent}` : ""}`;
      })
      .join("\n") || "(없음)";

  const personaRelBlocks =
    personaRelations
      .map((r) =>
        r.aware
          ? `- ${nameOfPersona(r.aId)} ${r.mutual ? "↔" : "→"} ${nameOfPersona(r.bId)}: ${r.score}/100 (${relationLabel(true, r.score)})`
          : `- ${nameOfPersona(r.aId)} ↔ ${nameOfPersona(r.bId)}: 서로 존재를 모름`,
      )
      .join("\n") || "(없음)";

  const groupRelBlocks =
    groupRelations
      .map((r) =>
        r.aware
          ? `- ${nameOfGroup(r.aId)} ↔ ${nameOfGroup(r.bId)}: ${r.score}/100 (${relationLabel(true, r.score)})`
          : `- ${nameOfGroup(r.aId)} ↔ ${nameOfGroup(r.bId)}: 서로 존재를 모름`,
      )
      .join("\n") || "(없음)";

  const pgRelBlocks =
    personaGroupRelations
      .map(
        (r) =>
          `- ${nameOfPersona(r.personaId)} ↔ ${nameOfGroup(r.groupId)}: ${r.score}/100 (캐릭터가 ${r.personaAware ? "앎" : "모름"} / 집단이 ${r.groupAware ? "앎" : "모름"})`,
      )
      .join("\n") || "(없음)";

  const factBlocks = facts.map((f) => `- ${f.content}`).join("\n") || "(없음)";

  return `# 세계관
- 시대/장소: ${world.overview || "미정"}
- 자연 법칙 & 기후: ${world.natureLaws || "미정"}
- 힘의 근원(마법/기술): ${world.magicSource || "미정"}
- 자원의 한계 및 대가: ${world.magicCost || "미정"}
- 절대 불가능한 규칙: ${world.magicLimits || "미정"}
- 지배 계급과 정권 형태: ${world.powerStructure || "미정"}
- 계급 & 신분 제도: ${world.classSystem || "미정"}
- 법과 징벌: ${world.lawAndPunishment || "미정"}
- 지리 & 교통: ${world.geography || "미정"}
- 의식주 & 자원: ${world.lifestyle || "미정"}
- 통화 & 경제: ${world.economy || "미정"}
- 대변혁 사건(역사): ${world.history || "미정"}
- 역사적 대립 구도: ${world.rivalries || "미정"}
- 금기와 전설: ${world.taboos || "없음"}
- 종교 & 신앙: ${world.religion || "미정"}
- 도덕 기준: ${world.morals || "미정"}
- 속어 & 표현: ${world.slang || "미정"}

# 등장인물
${personaBlocks}

# 집단
${groupBlocks}

# 캐릭터 간 관계 (1~100, 낮을수록 적대적, → 는 단방향)
${personaRelBlocks}

# 집단 간 관계
${groupRelBlocks}

# 캐릭터-집단 관계 (소속 여부와 무관)
${pgRelBlocks}

# 실제 사실 (전지적 작가는 이 모든 진실을 안다)
${factBlocks}`;
}

const SUGGEST_SCHEMA = {
  type: "object",
  properties: { options: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 } },
  required: ["options"],
};
const WRITE_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
};
const CHECK_SCHEMA = {
  type: "object",
  properties: { issues: { type: "array", items: { type: "string" } } },
  required: ["issues"],
};

export async function POST(req: Request) {
  const {
    mode,
    world,
    personas,
    groups,
    personaRelations,
    groupRelations,
    personaGroupRelations,
    facts,
    storySoFar,
    direction,
    newText,
    model = "",
    llm,
    viewpoint,
  } = (await req.json()) as {
    mode: "suggest" | "write" | "check";
    world: World;
    personas: Persona[];
    groups: Group[];
    personaRelations: Relation[];
    groupRelations: Relation[];
    personaGroupRelations: PersonaGroupRelation[];
    facts: Fact[];
    storySoFar: string;
    direction?: string;
    newText?: string;
    model?: string; // 로컬 Ollama용 모델 이름(다른 provider는 llm.xxxModel을 씀)
    llm?: LLMSettings;
    viewpoint?: Viewpoint;
  };

  const context = buildWorldContext(world, personas, groups, personaRelations, groupRelations, personaGroupRelations, facts);
  const storyBlock = `# 지금까지의 이야기 (새로 추가되기 전)\n${storySoFar || "(아직 없음)"}`;
  const vpMode = viewpoint?.mode ?? "omniscient";
  const vpRole = narratorRoleLabel(vpMode);
  const vpInstruction = viewpointInstruction(viewpoint, personas);

  try {
    if (mode === "check") {
      const viewpointCheckItem =
        vpMode === "omniscient"
          ? ""
          : `\n- 지금 시점 설정(${VIEWPOINT_LABEL[vpMode]})을 벗어났는가 — 서술자가 알 수 없거나 서술해선 안 되는 인물의 속마음·생각을 직접 서술문으로 드러냈거나(대사·행동으로 짐작하게 하는 게 아니라), 서술자가 그 자리에 없어서/듣지 못해서 알 수 없는 사건을 마치 직접 본 것처럼 서술했는가`;
      const system = `너는 이 세계관과 설정 전체를 엄격하게 검수하는 편집자다. 아래 설정과 지금까지의 이야기를 참고해,
"방금 새로 추가된 내용"이 설정과 충돌하는 부분이 있는지만 검토하라.
${vpMode === "omniscient" ? "" : `\n이 이야기는 ${vpRole}가 쓰고 있다.${vpInstruction}\n`}
확인할 것:
- 캐릭터가 자신의 성격·가치관·말투·금기와 다르게 행동하거나 말했는가
- 세계관 규칙(특히 "절대 불가능한 규칙")을 어겼는가
- 캐릭터가 몰라야 할 사실을 아는 것처럼 나왔거나, 존재를 모르는 인물/집단을 아는 것처럼 나왔는가
- 캐릭터 간/집단 간 관계 점수·태도와 모순되는 방식으로 상호작용했는가
- 이미 확립된 사실이나 이전 이야기 내용과 모순되는 내용이 나왔는가${viewpointCheckItem}

사소한 문체·어투 문제는 지적하지 마라 — 설정과의 실제 충돌만 짚어라. 문제가 없으면 빈 배열을 반환하라.

${context}

${storyBlock}

# 방금 새로 추가된 내용
${newText || "(없음)"}

반드시 JSON으로만 답한다: issues(문제점을 한 문장씩 구체적으로 설명한 문자열 배열, 없으면 빈 배열). 모든 내용은 한국어로 쓴다.`;
      const data = await callLLM(llm, model, system, [], CHECK_SCHEMA, 0.3);
      return NextResponse.json(data);
    } else if (mode === "suggest") {
      const system = `너는 ${vpRole}다. 아래 설정을 참고해 다음에 일어날 수 있는, 서로 다른 방향의 전개를 3가지 제안하라.
각 제안은 1~2문장으로 짧게, 서로 겹치지 않게, 등장인물의 성격·관계·세계관 규칙에 맞아야 한다. 아직 이야기가 없다면 이야기를 시작할 상황을 3가지 제안하라.
${vpInstruction}

${context}

${storyBlock}

반드시 JSON으로만 답한다: options(서로 다른 전개 방향 3개로 이루어진 문자열 배열). 모든 내용은 한국어로 쓴다.`;
      const data = await callLLM(llm, model, system, [], SUGGEST_SCHEMA, 0.9);
      return NextResponse.json(data);
    } else {
      const system = `너는 ${vpRole}다. 아래 설정을 참고해 이야기를 소설체로 이어 써라.
등장인물의 대사·행동·심리 묘사를 생생하게 포함하고, 각 인물의 성격·가치관·말투·서로의 관계·세계관 규칙에서 벗어나지 마라. 3~6문단 분량으로 써라.
${vpInstruction}

${context}

${storyBlock}

# 다음 전개 방향 (이 방향을 반영해 이어 써라)
${direction}

반드시 JSON으로만 답한다: text(소설체 본문 하나의 문자열). 모든 내용은 한국어로 쓴다.`;
      const data = await callLLM(llm, model, system, [], WRITE_SCHEMA, 0.85);
      return NextResponse.json(data);
    }
  } catch (e) {
    const msg = e instanceof TypeError ? llmConnectErrorMessage(llm) : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
