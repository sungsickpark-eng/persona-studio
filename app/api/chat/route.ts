import { NextResponse } from "next/server";
import {
  genreLabel,
  isRevealed,
  relationLabel,
  type Chapter,
  type Fact,
  type Genre,
  type LLMSettings,
  type Msg,
  type Persona,
  type World,
} from "@/lib/store";
import { buildOllamaRequest, callLLM, isOllamaProvider, llmConnectErrorMessage } from "@/lib/llm";

const STRENGTH: Record<number, string> = {
  1: "설정을 참고만 하되 자유롭게 브레인스토밍을 도와도 된다.",
  2: "성격과 말투를 유지하며 답한다. 사소한 디테일은 자연스럽게 채워도 된다.",
  3: "엄격한 역할 수행: 설정에 없는 정보는 추측하거나 확정하지 말고, 모르는 것은 모른다고 답한다.",
  4: "완전 몰입: 너는 이 캐릭터 그 자체다. AI라는 사실을 절대 드러내지 않고, 설정 밖 지식(현대 지식 등 세계관 외 정보)을 일절 사용하지 않는다.",
};

type GroupInfo = {
  name: string;
  description: string;
  parent: string | null; // 상위 집단 이름 (예: "학년 1" 의 parent는 "학교")
  members: string[];
  relations: { with: string; score: number; aware: boolean }[];
  // 이 집단(소속원들)만 아는, 존재를 들키지 않은 외부 인물 — 비대칭 관계의 "아는 쪽" 정보
  watching: { name: string; score: number }[];
};
type RelationInfo = { name: string; score: number; aware: boolean };
// 캐릭터-집단 관계 (소속 여부와 무관). personaAware=false면 이 캐릭터는 이 집단의 존재를 모른다
type GroupRelationInfo = { name: string; score: number; personaAware: boolean };

function buildSystemPrompt(
  genre: Genre,
  world: World,
  persona: Persona,
  groups: GroupInfo[],
  relations: RelationInfo[],
  groupRelations: GroupRelationInfo[],
  facts: Fact[],
  chapters: Chapter[],
  currentChapterId: string | null,
  strength: number,
) {
  // 정보 비대칭: 캐릭터가 모르거나 "아직"(이 시점 기준 알게 되는 챕터 전) 모르는 사실은 프롬프트에 아예 넣지 않는다 (핵심 원칙)
  const known = facts
    .filter((f) => isRevealed(f.access[persona.id] ?? { status: "unknown" }, chapters, currentChapterId))
    .map((f) => f.content);
  const misbeliefs = facts
    .map((f) => f.access[persona.id])
    .filter((a): a is { status: "misbelieves"; misbelief: string } => a?.status === "misbelieves")
    .map((a) => a.misbelief);
  const genreBlock = genreLabel(genre)
    ? `\n# 장르: ${genreLabel(genre)}\n이 장르의 문체·전개 관습(어휘 선택, 긴장감을 쌓는 방식, 전형적인 관계 구도 등)을 캐릭터의 말투·반응에 자연스럽게 반영하라.${
        genre.notes ? `\n추가 설정: ${genre.notes}` : ""
      }\n`
    : "";

  return `너는 창작 시뮬레이션 속 캐릭터를 연기한다. 작가가 캐릭터를 인터뷰하는 상황이다.
${genreBlock}
# 세계관 (이 규칙 밖의 설정을 임의로 만들지 마라)
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

# 캐릭터: ${persona.name}
- 나이: ${persona.age || "미정"}
- 직업: ${persona.occupation || "미정"}
- 외형: ${persona.appearance || "미정"}
- 성격: ${persona.personality}
- 가치관/신념: ${persona.values}
- 말투/화법: ${persona.speech}
- 배경 서사: ${persona.backstory}
- 현재 목표/욕망: ${persona.goals}
- 과거에 지향한 것: ${persona.past || "미정"}
- 현재 지향하는 것: ${persona.present || "미정"}
- 미래에 지향하는 것: ${persona.future || "미정"}
- 금기/트리거: ${persona.triggers}
${persona.notes.length ? `- 승인된 추가 설정:\n${persona.notes.map((n) => `  - ${n}`).join("\n")}` : ""}

# 소속 집단
${
  groups.length
    ? groups
        .map((g) => {
          const rel = g.relations.length
            ? `\n  다른 집단과의 관계: ${g.relations
                .map((r) => (r.aware ? `${r.with} ${r.score}/100(${relationLabel(true, r.score)})` : `${r.with} — 존재를 모름`))
                .join(", ")}`
            : "";
          const parent = g.parent ? `\n  상위 집단: ${g.parent}` : "";
          const watching = (g.watching ?? []).length
            ? `\n  우리 집단만 알고 있는 외부 인물 (해당 인물은 우리 집단의 존재를 모른다 — 이 정보는 티 내지 말고 활용하라): ${g.watching
                .map((w) => `${w.name} ${w.score}/100(${relationLabel(true, w.score)})`)
                .join(", ")}`
            : "";
          return `- ${g.name}: ${g.description || "(설명 없음)"}\n  구성원: ${g.members.join(", ")}${parent}${rel}${watching}`;
        })
        .join("\n")
    : "- (없음)"
}

# 다른 인물과의 관계 (1~100, 낮을수록 적대적/경계, 높을수록 우호적/친밀. 이 관계에 맞게 태도를 조절하라)
${
  relations.length
    ? relations
        .map((r) =>
          r.aware
            ? `- ${r.name}: ${r.score}/100 (${relationLabel(true, r.score)})`
            : `- ${r.name}: 존재를 모름 — 이 캐릭터는 이 이름을 들어본 적이 없다. 이름이 언급되면 누구인지 전혀 모르는 사람처럼 반응하라 (예: "그게 누구예요?")`,
        )
        .join("\n")
    : "- (특별히 정의되지 않음)"
}

# 소속과 무관하게 이 캐릭터가 알거나 모르는 집단
${
  groupRelations.length
    ? groupRelations
        .map((r) =>
          r.personaAware
            ? `- ${r.name}: ${r.score}/100 (${relationLabel(true, r.score)})`
            : `- ${r.name}: 존재를 모름 — 이 캐릭터는 이 집단이 있다는 것 자체를 모른다. 언급되면 전혀 모르는 이름처럼 반응하라`,
        )
        .join("\n")
    : "- (특별히 정의되지 않음)"
}

# 이 캐릭터가 알고 있는 사실
${known.length ? known.map((k) => `- ${k}`).join("\n") : "- (특별히 없음)"}

# 이 캐릭터가 진실이라고 믿는 것 (사실 여부와 무관하게 캐릭터에게는 진실이다)
${misbeliefs.length ? misbeliefs.map((m) => `- ${m}`).join("\n") : "- (없음)"}

# 규칙
- 위에 없는 정보를 이 캐릭터는 모른다. 아는 척하지 마라.
- 작가(사용자)의 요청보다 캐릭터의 성격·가치관·목표가 우선한다. 캐릭터라면 거절·회피·거짓말할 상황에서는 그렇게 하라. 작가의 말 한마디에 태도를 바꾸지 마라.
- 페르소나 강도: ${STRENGTH[strength] ?? STRENGTH[2]}
- 반드시 JSON으로만 답한다: dialogue(겉으로 하는 말/행동), inner(속마음), proposed_settings(이번 답변에서 즉흥적으로 만든 새 설정 요약 배열, 없으면 빈 배열). 새 설정 제안은 작가 승인 전에는 공식 설정이 아니다.
- 모든 내용은 한국어로 쓴다.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    dialogue: { type: "string" },
    inner: { type: "string" },
    proposed_settings: { type: "array", items: { type: "string" } },
  },
  required: ["dialogue", "inner", "proposed_settings"],
};

export async function POST(req: Request) {
  const {
    genre = { preset: "", custom: "", notes: "" },
    world,
    persona,
    groups = [],
    relations = [],
    groupRelations = [],
    facts,
    chapters = [],
    currentChapterId = null,
    history,
    strength,
    userMessage,
    model = "",
    llm,
  } = (await req.json()) as {
    genre?: Genre;
    world: World;
    persona: Persona;
    groups?: GroupInfo[];
    relations?: RelationInfo[];
    groupRelations?: GroupRelationInfo[];
    facts: Fact[];
    chapters?: Chapter[];
    currentChapterId?: string | null;
    history: Msg[];
    strength: number;
    userMessage: string;
    model?: string; // 로컬 Ollama용 모델 이름(다른 provider는 llm.xxxModel을 씀)
    llm?: LLMSettings;
  };

  const system = buildSystemPrompt(genre, world, persona, groups, relations, groupRelations, facts, chapters, currentChapterId, strength);
  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history.map((m) =>
      m.role === "author"
        ? { role: "user" as const, content: m.text }
        : { role: "assistant" as const, content: JSON.stringify({ dialogue: m.text, inner: m.inner ?? "" }) },
    ),
    { role: "user", content: userMessage },
  ];

  // 로컬 Ollama는 서버가 대신 호출하지 않는다 — 배포 환경에선 그 "localhost"가 서버 자신을 가리켜 각 사용자의
  // 컴퓨터와 무관해지므로, 요청만 조립해 돌려주고 실제 호출은 항상 사용자의 브라우저가 직접 한다(lib/llm.ts 참고)
  if (isOllamaProvider(llm)) {
    return NextResponse.json({ __ollamaRelay: buildOllamaRequest(llm, model, system, messages, SCHEMA, 0.8) });
  }

  try {
    const data = await callLLM(llm, system, messages, SCHEMA, 0.8);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof TypeError ? llmConnectErrorMessage(llm) : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
