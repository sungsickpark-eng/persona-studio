// Obsidian 내보내기 폴더(export.ts의 buildExportEntries가 만든 구조)를 다시 프로젝트로 복원.
// 소프트 삭제 상태(휴지통)는 애초에 내보내기 대상이 아니라 복원되지 않는다. 그 외(세계관·캐릭터·집단·사실·
// 인터뷰·이야기·관계 지수·이미지 자르기 위치·목차·시점·떡밥)는 app-data.json + .md 노트에서 되살린다.
import {
  DEFAULT_GENRE,
  DEFAULT_VIEWPOINT,
  uid,
  type Chapter,
  type Fact,
  type Foreshadow,
  type Group,
  type Msg,
  type Persona,
  type PersonaGroupRelation,
  type Project,
  type Relation,
  type StoryNode,
  type ViewpointMode,
  type World,
} from "./store";
import { safe } from "./export";
import { getDirectoryPicker, type FSDirHandle } from "./fs-types";

// export.ts의 buildAppData가 만드는 구조 — 이름 기반 참조라 되불러올 때 새로 생성되는 id와 무관하게 맞물린다
type AppData = {
  viewpoint?: { mode: ViewpointMode; narratorName: string | null };
  personaRelations?: { aName: string; bName: string; score: number; aware: boolean; mutual: boolean }[];
  groupRelations?: { aName: string; bName: string; score: number; aware: boolean; mutual: boolean }[];
  personaGroupRelations?: { personaName: string; groupName: string; score: number; personaAware: boolean; groupAware: boolean }[];
  chapters?: { depth: number; title: string; viewpointMode: ViewpointMode | null; viewpointNarratorName: string | null }[];
  personaImages?: { name: string; width?: number; height?: number; x?: number; y?: number }[];
  foreshadows?: {
    number: number;
    plantIndex: number;
    plantStart: number;
    plantEnd: number;
    plantText: string;
    resolveIndex: number | null;
    resolveStart?: number;
    resolveEnd?: number;
    resolveText?: string;
  }[];
};

async function readFileText(dir: FSDirHandle, name: string): Promise<string | null> {
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && entry.name === name) return await entry.getFile().then((f) => f.text());
  }
  return null;
}

async function getDirOrNull(dir: FSDirHandle, name: string): Promise<FSDirHandle | null> {
  for await (const entry of dir.values()) {
    if (entry.kind === "directory" && entry.name === name) return entry;
  }
  return null;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// export.ts의 wikiLink("[[이름]]")를 원래 텍스트로 되돌린다
function unwiki(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, "$1");
}

function bulletValue(lines: string[], label: string): string {
  const prefix = `- ${label}: `;
  const line = lines.find((l) => l.startsWith(prefix));
  return line ? unwiki(line.slice(prefix.length)) : "";
}

function parseWorld(overviewLines: string[]): World {
  const get = (label: string) => bulletValue(overviewLines, label);
  return {
    overview: get("시대/장소"),
    natureLaws: get("자연 법칙 & 기후"),
    magicSource: get("힘의 근원"),
    magicCost: get("자원의 한계 및 대가"),
    magicLimits: get("절대 불가능한 규칙"),
    powerStructure: get("지배 계급과 정권 형태"),
    classSystem: get("계급 & 신분 제도"),
    lawAndPunishment: get("법과 징벌"),
    geography: get("지리 & 교통"),
    lifestyle: get("의식주 & 자원"),
    economy: get("통화 & 경제"),
    history: get("대변혁 사건"),
    rivalries: get("역사적 대립 구도"),
    taboos: get("금기와 전설"),
    religion: get("종교 & 신앙"),
    morals: get("도덕 기준"),
    slang: get("속어 & 표현"),
  };
}

function parseNotes(lines: string[]): string[] {
  const idx = lines.indexOf("- 승인된 추가 설정:");
  if (idx === -1) return [];
  const notes: string[] = [];
  for (let i = idx + 1; i < lines.length && lines[i].startsWith("  - "); i++) notes.push(unwiki(lines[i].slice(4)));
  return notes;
}

function parseChat(lines: string[]): Msg[] {
  const idx = lines.indexOf("## 인터뷰 로그");
  if (idx === -1) return [];
  const msgs: Msg[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\*\*(.+?)\*\*: (.*)$/);
    if (!m) continue;
    const [, speaker, text] = m;
    if (speaker === "작가") {
      msgs.push({ role: "author", text: unwiki(text) });
      continue;
    }
    const inner = lines[i + 1]?.match(/^> 속마음: (.*)$/);
    msgs.push({ role: "char", text: unwiki(text), ...(inner ? { inner: unwiki(inner[1]) } : {}) });
    if (inner) i++;
  }
  return msgs;
}

async function parsePersona(text: string, designDir: FSDirHandle | null): Promise<{ persona: Persona; chat: Msg[] }> {
  const lines = text.split("\n");
  const name = (lines[0] ?? "").replace(/^# /, "").trim() || "무제";
  const persona: Persona = {
    id: uid(),
    name,
    age: bulletValue(lines, "나이"),
    occupation: bulletValue(lines, "직업"),
    appearance: bulletValue(lines, "외형"),
    personality: bulletValue(lines, "성격"),
    values: bulletValue(lines, "가치관"),
    speech: bulletValue(lines, "말투"),
    backstory: bulletValue(lines, "배경"),
    goals: bulletValue(lines, "목표"),
    past: bulletValue(lines, "과거 지향"),
    present: bulletValue(lines, "현재 지향"),
    future: bulletValue(lines, "미래 지향"),
    triggers: bulletValue(lines, "트리거"),
    notes: parseNotes(lines),
    createdAt: new Date().toISOString(),
    introChapterId: null,
  };
  if (designDir) {
    const imgName = `${safe(name)}-디자인.jpg`;
    for await (const entry of designDir.values()) {
      if (entry.kind === "file" && entry.name === imgName) {
        const buf = await entry.getFile().then((f) => f.arrayBuffer());
        persona.image = `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
        break;
      }
    }
  }
  return { persona, chat: parseChat(lines) };
}

function parseGroup(text: string, personaIdByName: Map<string, string>): { group: Group; parentName: string | null } {
  const lines = text.split("\n");
  const name = (lines[0] ?? "").replace(/^# /, "").trim() || "무제";
  const description = unwiki(lines[2] ?? "");
  const parentMatch = lines.find((l) => l.startsWith("상위 집단: "))?.match(/\[\[(.+?)\]\]/);
  const memberIdx = lines.indexOf("## 구성원");
  const memberIds: string[] = [];
  if (memberIdx !== -1) {
    for (let i = memberIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^- \[\[(.+?)\]\]$/);
      const id = m && personaIdByName.get(m[1]);
      if (id) memberIds.push(id);
    }
  }
  return { group: { id: uid(), name, description, memberIds }, parentName: parentMatch?.[1] ?? null };
}

function parseFacts(overviewLines: string[], personaIdByName: Map<string, string>): Fact[] {
  const idx = overviewLines.indexOf("## 사실 · 비밀 (작가 전용)");
  if (idx === -1) return [];
  const facts: Fact[] = [];
  let current: Fact | null = null;
  for (let i = idx + 1; i < overviewLines.length; i++) {
    const line = overviewLines[i];
    if (line.startsWith("  - ") && current) {
      const m = line.slice(4).match(/^\[\[(.+?)\]\]: (.*)$/);
      if (!m) continue;
      const personaId = personaIdByName.get(m[1]);
      if (!personaId) continue;
      if (m[2] === "알고 있음") current.access[personaId] = { status: "knows" };
      else {
        const mis = m[2].match(/^오해 — "(.*)"$/);
        if (mis) current.access[personaId] = { status: "misbelieves", misbelief: unwiki(mis[1]) };
      }
    } else if (line.startsWith("- ")) {
      current = { id: uid(), content: unwiki(line.slice(2)), access: {} };
      facts.push(current);
    }
  }
  return facts;
}

// "---"로 구분된 블록 단위 — buildStoryMarkdown의 역변환. 이 구분자 덕분에 노드 개수·순서가 내보내기와
// 정확히 일치해서, app-data.json의 떡밥이 가리키는 노드 인덱스가 어긋나지 않는다
function parseStory(text: string): StoryNode[] {
  const headerEnd = text.indexOf("\n\n"); // "# 프로젝트 — 이야기" 제목 줄 다음 빈 줄까지 건너뜀
  const body = headerEnd === -1 ? "" : text.slice(headerEnd + 2);
  if (!body) return [];
  let prevId: string | null = null;
  return body.split("\n\n---\n\n").map((raw) => {
    const block = raw.trim();
    const direction = block.match(/^## ▶ ([\s\S]*)$/);
    const node: StoryNode = { id: uid(), parentId: prevId, role: direction ? "direction" : "story", text: direction ? direction[1] : block };
    prevId = node.id;
    return node;
  });
}

function parseAppData(text: string | null): AppData {
  if (!text) return {};
  try {
    return JSON.parse(text) as AppData;
  } catch {
    return {};
  }
}

function buildRelations(list: { aName: string; bName: string; score: number; aware: boolean; mutual: boolean }[] | undefined, idByName: Map<string, string>): Relation[] {
  const out: Relation[] = [];
  for (const r of list ?? []) {
    const aId = idByName.get(r.aName);
    const bId = idByName.get(r.bName);
    if (aId && bId) out.push({ id: uid(), aId, bId, score: r.score, aware: r.aware, mutual: r.mutual });
  }
  return out;
}

function buildPersonaGroupRelations(
  list: AppData["personaGroupRelations"],
  personaIdByName: Map<string, string>,
  groupIdByName: Map<string, string>,
): PersonaGroupRelation[] {
  const out: PersonaGroupRelation[] = [];
  for (const r of list ?? []) {
    const personaId = personaIdByName.get(r.personaName);
    const groupId = groupIdByName.get(r.groupName);
    if (personaId && groupId) out.push({ id: uid(), personaId, groupId, score: r.score, personaAware: r.personaAware, groupAware: r.groupAware });
  }
  return out;
}

// depth 배열을 스택으로 훑어 부모-자식 트리를 되살린다 — 이름이 중복돼도 순서·들여쓰기만으로 정확히 복원됨
function buildChapters(list: AppData["chapters"], personaIdByName: Map<string, string>): Chapter[] {
  const stack: { depth: number; id: string }[] = [];
  const chapters: Chapter[] = [];
  for (const c of list ?? []) {
    while (stack.length && stack[stack.length - 1].depth >= c.depth) stack.pop();
    const id = uid();
    const chapter: Chapter = { id, parentId: stack.length ? stack[stack.length - 1].id : null, title: c.title };
    if (c.viewpointMode) {
      chapter.viewpoint = {
        mode: c.viewpointMode,
        narratorPersonaId: c.viewpointNarratorName ? (personaIdByName.get(c.viewpointNarratorName) ?? null) : null,
      };
    }
    chapters.push(chapter);
    stack.push({ depth: c.depth, id });
  }
  return chapters;
}

// 노드 인덱스는 parseStory가 만든 story 배열 순서를 그대로 가리킨다(내보낼 때와 동일한 순서가 보장됨)
function buildForeshadows(list: AppData["foreshadows"], story: StoryNode[]): Foreshadow[] {
  const out: Foreshadow[] = [];
  for (const f of list ?? []) {
    const plantNode = story[f.plantIndex];
    if (!plantNode) continue;
    const resolveNode = f.resolveIndex !== null && f.resolveIndex !== undefined ? story[f.resolveIndex] : undefined;
    out.push({
      id: uid(),
      number: f.number,
      plantNodeId: plantNode.id,
      plantStart: f.plantStart,
      plantEnd: f.plantEnd,
      plantText: f.plantText,
      ...(resolveNode ? { resolveNodeId: resolveNode.id, resolveStart: f.resolveStart, resolveEnd: f.resolveEnd, resolveText: f.resolveText } : {}),
    });
  }
  return out;
}

export async function parseProjectFolder(dir: FSDirHandle): Promise<Project | null> {
  const overviewText = await readFileText(dir, `${dir.name}.md`);
  if (overviewText === null) return null; // 이 앱이 만든 내보내기 폴더가 아님
  const overviewLines = overviewText.split("\n");

  const personas: Persona[] = [];
  const chats: Record<string, Msg[]> = {};
  const personaDir = await getDirOrNull(dir, "인물");
  const designDir = await getDirOrNull(dir, "디자인");
  if (personaDir) {
    for await (const entry of personaDir.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(".md")) continue;
      const { persona, chat } = await parsePersona(await entry.getFile().then((f) => f.text()), designDir);
      personas.push(persona);
      if (chat.length) chats[persona.id] = chat;
    }
  }
  const personaIdByName = new Map(personas.map((p) => [p.name, p.id]));

  const groups: Group[] = [];
  const parentNameById = new Map<string, string>();
  const groupDir = await getDirOrNull(dir, "집단");
  if (groupDir) {
    for await (const entry of groupDir.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(".md")) continue;
      const { group, parentName } = parseGroup(await entry.getFile().then((f) => f.text()), personaIdByName);
      groups.push(group);
      if (parentName) parentNameById.set(group.id, parentName);
    }
  }
  const groupIdByName = new Map(groups.map((g) => [g.name, g.id]));
  for (const g of groups) {
    const parentName = parentNameById.get(g.id);
    if (parentName) g.parentId = groupIdByName.get(parentName);
  }

  let story: StoryNode[] = [];
  let storyCurrentId: string | null = null;
  const storyText = await readFileText(dir, "이야기.md");
  if (storyText) {
    story = parseStory(storyText);
    storyCurrentId = story.length ? story[story.length - 1].id : null;
  }

  const appData = parseAppData(await readFileText(dir, "app-data.json"));
  for (const per of personas) {
    const img = appData.personaImages?.find((x) => x.name === per.name);
    if (!img) continue;
    if (img.width !== undefined) per.imageWidth = img.width;
    if (img.height !== undefined) per.imageHeight = img.height;
    if (img.x !== undefined && img.y !== undefined) per.imagePosition = { x: img.x, y: img.y };
  }

  return {
    id: uid(),
    name: dir.name,
    genre: { ...DEFAULT_GENRE },
    world: parseWorld(overviewLines),
    personas,
    groups,
    personaRelations: buildRelations(appData.personaRelations, personaIdByName),
    groupRelations: buildRelations(appData.groupRelations, groupIdByName),
    personaGroupRelations: buildPersonaGroupRelations(appData.personaGroupRelations, personaIdByName, groupIdByName),
    facts: parseFacts(overviewLines, personaIdByName),
    chats,
    pending: [],
    story,
    storyCurrentId,
    chapters: buildChapters(appData.chapters, personaIdByName),
    foreshadows: buildForeshadows(appData.foreshadows, story),
    viewpoint: appData.viewpoint
      ? { mode: appData.viewpoint.mode, narratorPersonaId: appData.viewpoint.narratorName ? (personaIdByName.get(appData.viewpoint.narratorName) ?? null) : null }
      : { ...DEFAULT_VIEWPOINT },
  };
}

// 폴더 선택 창을 띄워, 그 바로 아래에 있는 내보내기 폴더들(각각 하나의 프로젝트)을 전부 복원한다.
// 내보내기 폴더가 아닌 하위 폴더(예: 무관한 다른 Obsidian 노트 폴더)는 조용히 건너뛴다.
export async function importObsidianVault(): Promise<Project[]> {
  const picker = getDirectoryPicker();
  if (!picker) throw new Error("이 브라우저는 폴더 불러오기를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.");
  const root = await picker();
  const projects: Project[] = [];
  for await (const entry of root.values()) {
    if (entry.kind !== "directory") continue;
    const project = await parseProjectFolder(entry);
    if (project) projects.push(project);
  }
  return projects;
}
