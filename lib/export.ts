// Obsidian 볼트로 내보내기: 캐릭터/집단을 노트별 개별 파일로 만들고 서로 [[위키링크]]로 연결.
// 압축 없이 사용자가 고른 폴더 안에 프로젝트명 폴더를 만들어 파일을 직접 쓴다 (File System Access API, Chrome/Edge 전용).
import { groupTreeOrder, storyActivePath, type Project, type StoryNode } from "./store";

const safe = (name: string) => name.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() || "무제";

// 텍스트 안에 등장하는 다른 캐릭터/집단 이름을 [[이름]] 링크로 치환
function wikiLink(text: string, names: string[]): string {
  if (!text) return text;
  const sorted = [...names].sort((a, b) => b.length - a.length).filter(Boolean);
  const tokens: string[] = [];
  let out = text;
  sorted.forEach((name, i) => {
    tokens[i] = ` ${i} `;
    out = out.split(name).join(tokens[i]); // 토큰으로 먼저 치환해 중복 링크 방지
  });
  sorted.forEach((name, i) => {
    out = out.split(tokens[i]).join(`[[${safe(name)}]]`);
  });
  return out;
}

export type ExportEntry =
  | { dirs: string[]; name: string; content: string }
  | { dirs: string[]; name: string; base64: string };

// 파일시스템에 손대지 않는 순수 함수 — 실제 쓰기(exportObsidianFiles)와 회귀 테스트 양쪽에서 재사용
export function buildExportEntries(p: Project): ExportEntry[] {
  const entries: ExportEntry[] = [];
  const root = safe(p.name);
  // 삭제(휴지통)된 캐릭터/집단은 내보내기에서 제외
  const personas = p.personas.filter((x) => !x.deleted);
  const groups = p.groups.filter((x) => !x.deleted);
  const allNames = [...personas.map((x) => x.name), ...groups.map((x) => x.name)];
  // 자기 자신 이름은 자기 노트 안에서 링크하지 않도록 제외한 목록을 만들어 사용
  const linksFor = (self: string) => allNames.filter((n) => n !== self);

  // 프로젝트 개요 노트
  const overview: string[] = [`# ${p.name}`, "", "## 세계관"];
  overview.push(
    `- 시대/장소: ${p.world.overview}`,
    `- 자연 법칙 & 기후: ${p.world.natureLaws}`,
    `- 힘의 근원: ${p.world.magicSource}`,
    `- 자원의 한계 및 대가: ${p.world.magicCost}`,
    `- 절대 불가능한 규칙: ${p.world.magicLimits}`,
    `- 지배 계급과 정권 형태: ${p.world.powerStructure}`,
    `- 계급 & 신분 제도: ${p.world.classSystem}`,
    `- 법과 징벌: ${p.world.lawAndPunishment}`,
    `- 지리 & 교통: ${p.world.geography}`,
    `- 의식주 & 자원: ${p.world.lifestyle}`,
    `- 통화 & 경제: ${p.world.economy}`,
    `- 대변혁 사건: ${p.world.history}`,
    `- 역사적 대립 구도: ${p.world.rivalries}`,
    `- 금기와 전설: ${p.world.taboos}`,
    `- 종교 & 신앙: ${p.world.religion}`,
    `- 도덕 기준: ${p.world.morals}`,
    `- 속어 & 표현: ${p.world.slang}`,
    "",
  );
  overview.push("## 인물", ...personas.map((per) => `- [[${safe(per.name)}]]`), "");
  overview.push(
    "## 집단",
    ...groupTreeOrder(groups).map(({ group: g, depth }) => `${"  ".repeat(depth)}- [[${safe(g.name)}]]`),
    "",
  );
  overview.push("## 사실 · 비밀 (작가 전용)");
  for (const f of p.facts) {
    overview.push(`- ${wikiLink(f.content, allNames)}`);
    for (const per of personas) {
      const a = f.access[per.id];
      if (a?.status === "knows") overview.push(`  - [[${safe(per.name)}]]: 알고 있음`);
      if (a?.status === "misbelieves") overview.push(`  - [[${safe(per.name)}]]: 오해 — "${wikiLink(a.misbelief, allNames)}"`);
    }
  }
  entries.push({ dirs: [root], name: `${root}.md`, content: overview.join("\n") });

  // 캐릭터 노트 (+ 디자인 이미지)
  for (const per of personas) {
    const link = (t: string) => wikiLink(t, linksFor(per.name));
    const lines: string[] = [`# ${per.name}`, ""];
    if (per.image) {
      const imgName = `${safe(per.name)}-디자인.jpg`;
      entries.push({ dirs: [root, "디자인"], name: imgName, base64: per.image.split(",")[1] });
      lines.push(`![[${imgName}]]`, "");
    }
    const myGroups = groups.filter((g) => g.memberIds.includes(per.id));
    if (myGroups.length) lines.push(`소속: ${myGroups.map((g) => `[[${safe(g.name)}]]`).join(", ")}`, "");
    lines.push(
      `- 나이: ${link(per.age)}`,
      `- 직업: ${link(per.occupation)}`,
      `- 외형: ${link(per.appearance)}`,
      `- 성격: ${link(per.personality)}`,
      `- 가치관: ${link(per.values)}`,
      `- 말투: ${link(per.speech)}`,
      `- 배경: ${link(per.backstory)}`,
      `- 목표: ${link(per.goals)}`,
      `- 과거 지향: ${link(per.past)}`,
      `- 현재 지향: ${link(per.present)}`,
      `- 미래 지향: ${link(per.future)}`,
      `- 트리거: ${link(per.triggers)}`,
    );
    if (per.notes.length) lines.push(`- 승인된 추가 설정:`, ...per.notes.map((n) => `  - ${link(n)}`));
    const chat = p.chats[per.id] ?? [];
    if (chat.length) {
      lines.push("", "## 인터뷰 로그");
      for (const m of chat) {
        if (m.role === "author") lines.push(`**작가**: ${link(m.text)}`);
        else {
          lines.push(`**${per.name}**: ${link(m.text)}`);
          if (m.inner) lines.push(`> 속마음: ${link(m.inner)}`);
        }
      }
    }
    entries.push({ dirs: [root, "인물"], name: `${safe(per.name)}.md`, content: lines.join("\n") });
  }

  // 집단 노트 (상위/하위 집단 트리 포함)
  for (const g of groups) {
    const lines: string[] = [`# ${g.name}`, "", wikiLink(g.description, linksFor(g.name)), ""];
    const parent = groups.find((x) => x.id === g.parentId);
    if (parent) lines.push(`상위 집단: [[${safe(parent.name)}]]`, "");
    const children = groups.filter((x) => x.parentId === g.id);
    if (children.length) lines.push(`하위 집단: ${children.map((c) => `[[${safe(c.name)}]]`).join(", ")}`, "");
    lines.push(
      "## 구성원",
      ...g.memberIds
        .map((id) => personas.find((x) => x.id === id))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((per) => `- [[${safe(per.name)}]]`),
    );
    entries.push({ dirs: [root, "집단"], name: `${safe(g.name)}.md`, content: lines.join("\n") });
  }

  // 이야기 쓰기 로그(현재 이어 쓰고 있는 가지) — 있으면 Obsidian 폴더 내보내기에 자동으로 포함됨
  const activeStory = storyActivePath(p.story, p.storyCurrentId);
  if (activeStory.length) {
    entries.push({ dirs: [root], name: "이야기.md", content: buildStoryMarkdown(p, activeStory) });
  }

  return entries;
}

// "이야기 쓰기" 로그(트리에서 활성 경로만)를 마크다운 텍스트로 변환. direction은 소제목, story는 본문 문단으로 나열
export function buildStoryMarkdown(p: Project, path: StoryNode[]): string {
  const lines: string[] = [`# ${p.name} — 이야기`, ""];
  for (const entry of path) {
    if (entry.role === "direction") lines.push(`## ▶ ${entry.text}`, "");
    else lines.push(entry.text, "");
  }
  return lines.join("\n");
}

// File System Access API의 필요한 부분만 최소로 선언 — TS 표준 DOM 타입에 없어도 동작하도록
type FSDirHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FSDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FSFileHandle>;
};
type FSFileHandle = { createWritable(): Promise<FSWritable> };
type FSWritable = { write(data: string | Uint8Array): Promise<void>; close(): Promise<void> };

// 폴더 선택 창을 띄운 뒤, 넘겨받은 항목들을 그 폴더 아래에 실제 파일로 쓴다.
// 사용자가 선택을 취소하면 AbortError가 그대로 던져진다 (호출부에서 무시 처리).
async function writeEntriesToPickedFolder(entries: ExportEntry[]): Promise<void> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FSDirHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("이 브라우저는 폴더로 내보내기를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.");
  const rootHandle = await picker();

  const dirCache = new Map<string, FSDirHandle>();
  const getDir = async (dirs: string[]) => {
    const key = dirs.join("/");
    const cached = dirCache.get(key);
    if (cached) return cached;
    let handle = rootHandle;
    for (const d of dirs) handle = await handle.getDirectoryHandle(d, { create: true });
    dirCache.set(key, handle);
    return handle;
  };

  for (const entry of entries) {
    const dir = await getDir(entry.dirs);
    const fileHandle = await dir.getFileHandle(entry.name, { create: true });
    const writable = await fileHandle.createWritable();
    if ("content" in entry) {
      await writable.write(entry.content);
    } else {
      await writable.write(Uint8Array.from(atob(entry.base64), (c) => c.charCodeAt(0)));
    }
    await writable.close();
  }
}

// 폴더를 골라 그 안에 "프로젝트명" 폴더를 만들고 인물·집단·이야기 노트를 개별 파일로 쓴다.
export async function exportObsidianFiles(p: Project): Promise<void> {
  await writeEntriesToPickedFolder(buildExportEntries(p));
}

// 이야기만 따로 내보낼 때도 같은 폴더 구조("프로젝트명/이야기.md")를 쓴다 — Obsidian 폴더 내보내기와 위치가 항상 일치함
export async function exportStoryFile(p: Project): Promise<void> {
  const root = safe(p.name);
  const activeStory = storyActivePath(p.story, p.storyCurrentId);
  await writeEntriesToPickedFolder([{ dirs: [root], name: "이야기.md", content: buildStoryMarkdown(p, activeStory) }]);
}
