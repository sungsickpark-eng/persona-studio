// Obsidian 내보내기 자가 점검: npx tsx scripts/check-export.mts
import assert from "node:assert";
import { buildExportEntries } from "../lib/export";
import type { Project } from "../lib/store";

// 1x1 픽셀 JPEG dataURL
const tinyJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";

const project: Project = {
  id: "p1",
  name: "테스트",
  world: {
    overview: "현대 서울",
    natureLaws: "",
    magicSource: "",
    magicCost: "",
    magicLimits: "",
    powerStructure: "",
    classSystem: "",
    lawAndPunishment: "",
    geography: "",
    lifestyle: "",
    economy: "",
    history: "",
    rivalries: "",
    taboos: "",
    religion: "",
    morals: "",
    slang: "",
  },
  personas: [
    { id: "a", name: "민수", age: "", occupation: "", appearance: "", personality: "영희를 경계한다", values: "", speech: "", backstory: "", goals: "", past: "", present: "", future: "", triggers: "", notes: [], createdAt: "", introChapterId: null, image: tinyJpeg },
    { id: "b", name: "영희", age: "", occupation: "", appearance: "", personality: "", values: "", speech: "", backstory: "", goals: "", past: "", present: "", future: "", triggers: "", notes: [], createdAt: "", introChapterId: null },
    { id: "c", name: "탈퇴자", age: "", occupation: "", appearance: "", personality: "", values: "", speech: "", backstory: "", goals: "", past: "", present: "", future: "", triggers: "", notes: [], createdAt: "", introChapterId: null, deleted: true },
  ],
  groups: [
    { id: "g1", name: "형사팀", description: "민수가 속한 조직", memberIds: ["a"] },
    { id: "g2", name: "학교", description: "", memberIds: [] },
    { id: "g3", name: "1학년", description: "", memberIds: [], parentId: "g2" },
    { id: "g4", name: "폐쇄된 반", description: "", memberIds: [], parentId: "g2", deleted: true },
  ],
  personaRelations: [],
  groupRelations: [],
  personaGroupRelations: [],
  facts: [{ id: "f1", content: "준호가 범인이다", access: { a: { status: "misbelieves", misbelief: "영희가 범인이다" } } }],
  chats: {},
  pending: [],
  story: [
    { id: "s1", parentId: null, role: "direction", text: "테스트 방향" },
    { id: "s2", parentId: "s1", role: "story", text: "테스트 본문" },
  ],
  storyCurrentId: "s2",
  chapters: [],
  foreshadows: [],
  viewpoint: { mode: "omniscient", narratorPersonaId: null },
  genre: { presets: [], custom: "", notes: "" },
};

const entries = buildExportEntries(project);
const paths = entries.map((e) => [...e.dirs, e.name].join("/"));
const textOf = (path: string) => {
  const e = entries.find((x) => [...x.dirs, x.name].join("/") === path);
  return e && "content" in e ? e.content : undefined;
};

// 노트/이미지 파일이 모두 생성되는가
for (const expected of ["테스트/테스트.md", "테스트/인물/민수.md", "테스트/인물/영희.md", "테스트/집단/형사팀.md", "테스트/디자인/민수-디자인.jpg"]) {
  assert(paths.includes(expected), `누락: ${expected} (실제: ${paths.join(", ")})`);
}

const designEntry = entries.find((e) => e.name === "민수-디자인.jpg");
assert(designEntry && "base64" in designEntry, "디자인 이미지가 base64 항목으로 생성되지 않음");

const minsu = textOf("테스트/인물/민수.md")!;
assert(minsu.includes("![[민수-디자인.jpg]]"), "디자인 임베드 누락");
assert(minsu.includes("소속: [[형사팀]]"), "집단 링크 누락");
assert(minsu.includes("[[영희]]를 경계한다"), "본문 인명 위키링크 누락");
assert(!minsu.includes("[[민수]]"), "자기 자신을 링크하면 안 됨");

const team = textOf("테스트/집단/형사팀.md")!;
assert(team.includes("- [[민수]]"), "집단 구성원 링크 누락");
assert(team.includes("[[민수]]가 속한 조직"), "집단 설명 인명 링크 누락");

const overview = textOf("테스트/테스트.md")!;
assert(overview.includes('오해 — "[[영희]]가 범인이다"'), "오해 항목 링크 누락");
assert(!overview.includes("탈퇴자"), "삭제된 캐릭터가 내보내기에 포함되면 안 됨");
assert(!overview.includes("폐쇄된 반"), "삭제된 집단이 내보내기에 포함되면 안 됨");
assert(overview.includes("- [[학교]]") && overview.includes("  - [[1학년]]"), "집단 트리 들여쓰기 누락");

const grade1 = textOf("테스트/집단/1학년.md")!;
assert(grade1.includes("상위 집단: [[학교]]"), "상위 집단 링크 누락");
const school = textOf("테스트/집단/학교.md")!;
assert(school.includes("하위 집단: [[1학년]]"), "하위 집단 링크 누락");
assert(!school.includes("폐쇄된 반"), "학교 노트에 삭제된 하위 집단이 보이면 안 됨");

// 이야기 쓰기 로그가 Obsidian 폴더 내보내기에 자동으로 포함되는지
assert(paths.includes("테스트/이야기.md"), "이야기.md가 자동으로 포함되지 않음");
const storyMd = textOf("테스트/이야기.md")!;
assert(storyMd.includes("## ▶ 테스트 방향"), "이야기 방향(direction)이 소제목으로 안 들어감");
assert(storyMd.includes("테스트 본문"), "이야기 본문(story)이 안 들어감");

console.log("OK —", paths.length, "files:", paths.join(", "));
