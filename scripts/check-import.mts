// Obsidian 내보내기 → 가져오기 왕복 자가 점검: npx tsx scripts/check-import.mts
// 실제 파일시스템 없이, buildExportEntries가 만든 항목들로 File System Access API 핸들을 흉내내
// parseProjectFolder에 그대로 먹인다 (브라우저 없이도 파서 로직을 검증할 수 있음).
import assert from "node:assert";
import { buildExportEntries } from "../lib/export";
import { parseProjectFolder } from "../lib/import";
import type { Project } from "../lib/store";

const tinyJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";

const project: Project = {
  id: "p1",
  name: "테스트",
  world: {
    overview: "현대 서울",
    natureLaws: "", magicSource: "", magicCost: "", magicLimits: "",
    powerStructure: "", classSystem: "", lawAndPunishment: "",
    geography: "", lifestyle: "", economy: "",
    history: "", rivalries: "", taboos: "",
    religion: "", morals: "", slang: "",
  },
  personas: [
    { id: "a", name: "민수", gender: "male", genderCustom: "", age: "32", occupation: "형사", appearance: "", personality: "영희를 경계한다", values: "", speech: "", oppositeSexView: "영희를 믿지 못함", backstory: "", goals: "", past: "", present: "", future: "", triggers: "", notes: ["작가가 승인한 설정"], createdAt: "", introChapterId: null, image: tinyJpeg, imageWidth: 800, imageHeight: 600, imagePosition: { x: 60, y: 30 } },
    { id: "b", name: "영희", gender: "custom", genderCustom: "", age: "", occupation: "", appearance: "", personality: "", values: "", speech: "", oppositeSexView: "", backstory: "", goals: "", past: "", present: "", future: "", triggers: "", notes: [], createdAt: "", introChapterId: null },
    { id: "c", name: "탈퇴자", gender: "custom", genderCustom: "", age: "", occupation: "", appearance: "", personality: "", values: "", speech: "", oppositeSexView: "", backstory: "", goals: "", past: "", present: "", future: "", triggers: "", notes: [], createdAt: "", introChapterId: null, deleted: true },
  ],
  groups: [
    { id: "g1", name: "형사팀", description: "민수가 속한 조직", memberIds: ["a"] },
    { id: "g2", name: "학교", description: "", memberIds: [] },
    { id: "g3", name: "1학년", description: "", memberIds: [], parentId: "g2" },
  ],
  personaRelations: [{ id: "r1", aId: "a", bId: "b", score: 15, aware: true, mutual: false }],
  groupRelations: [{ id: "r2", aId: "g2", bId: "g3", score: 70, aware: true, mutual: true }],
  personaGroupRelations: [{ id: "r3", personaId: "b", groupId: "g1", score: 40, personaAware: false, groupAware: true }],
  facts: [{ id: "f1", content: "준호가 범인이다", access: { a: { status: "misbelieves", misbelief: "영희가 범인이다" }, b: { status: "knows" } } }],
  chats: { a: [{ role: "author", text: "요즘 어때?" }, { role: "char", text: "그럭저럭이요", inner: "사실 지쳤다" }] },
  pending: [],
  story: [
    { id: "s1", parentId: null, role: "direction", text: "테스트 방향" },
    { id: "s2", parentId: "s1", role: "story", text: "테스트 본문" },
  ],
  storyCurrentId: "s2",
  chapters: [
    { id: "ch1", parentId: null, title: "1막" },
    { id: "ch2", parentId: "ch1", title: "1장", viewpoint: { mode: "firstProtagonist", narratorPersonaId: "a" } },
  ],
  foreshadows: [
    { id: "fs1", number: 1, plantNodeId: "s1", plantStart: 0, plantEnd: 3, plantText: "테스", resolveNodeId: "s2", resolveStart: 1, resolveEnd: 3, resolveText: "스트" },
  ],
  viewpoint: { mode: "omniscient", narratorPersonaId: null },
  genre: { presets: [], custom: "", notes: "" },
};

// --- buildExportEntries 결과를 File System Access API 핸들처럼 흉내낸다 ---
type FileNode = { kind: "file"; name: string; content?: string; base64?: string };
type DirNode = { kind: "directory"; name: string; children: Map<string, FileNode | DirNode> };

function buildTree(entries: ReturnType<typeof buildExportEntries>, rootName: string): DirNode {
  const root: DirNode = { kind: "directory", name: rootName, children: new Map() };
  for (const e of entries) {
    let cur = root;
    for (const d of e.dirs.slice(1)) {
      // 첫 세그먼트(프로젝트명)는 root 자신이므로 건너뜀
      let child = cur.children.get(d) as DirNode | undefined;
      if (!child) {
        child = { kind: "directory", name: d, children: new Map() };
        cur.children.set(d, child);
      }
      cur = child;
    }
    const file: FileNode = "content" in e ? { kind: "file", name: e.name, content: e.content } : { kind: "file", name: e.name, base64: e.base64 };
    cur.children.set(e.name, file);
  }
  return root;
}

function wrapFile(node: FileNode) {
  return {
    kind: "file" as const,
    name: node.name,
    async getFile() {
      return {
        async text() {
          return node.content ?? "";
        },
        async arrayBuffer() {
          return Uint8Array.from(Buffer.from(node.base64 ?? "", "base64")).buffer;
        },
      };
    },
  };
}

function wrapDir(node: DirNode): {
  kind: "directory";
  name: string;
  values(): AsyncGenerator<ReturnType<typeof wrapFile> | ReturnType<typeof wrapDir>>;
} {
  return {
    kind: "directory" as const,
    name: node.name,
    async *values() {
      for (const child of node.children.values()) {
        yield child.kind === "file" ? wrapFile(child) : wrapDir(child);
      }
    },
  };
}

const entries = buildExportEntries(project);
const tree = buildTree(entries, "테스트");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const restored = await parseProjectFolder(wrapDir(tree) as any);

assert(restored, "프로젝트가 복원되지 않음(내보내기 폴더로 인식 못함)");
assert.strictEqual(restored!.world.overview, "현대 서울", "세계관 필드 복원 실패");

const minsu = restored!.personas.find((p) => p.name === "민수");
assert(minsu, "민수가 복원되지 않음");
assert.strictEqual(minsu!.gender, "male", "성별 필드 복원 실패");
assert.strictEqual(minsu!.oppositeSexView, "영희를 믿지 못함", "이성관 필드 복원 실패");
assert.strictEqual(minsu!.age, "32", "나이 필드 복원 실패");
assert.strictEqual(minsu!.occupation, "형사", "직업 필드 복원 실패");
assert.strictEqual(minsu!.personality, "영희를 경계한다", "위키링크 복원(민수) 실패 — [[영희]]가 그대로 남으면 안 됨");
assert.strictEqual(minsu!.notes[0], "작가가 승인한 설정", "승인된 추가 설정 복원 실패");
assert(minsu!.image?.startsWith("data:image/jpeg;base64,"), "디자인 이미지 복원 실패");
assert.strictEqual(minsu!.image!.split(",")[1], tinyJpeg.split(",")[1], "디자인 이미지 내용이 원본과 다름");

assert.strictEqual(restored!.personas.length, 2, "삭제된 캐릭터(탈퇴자)가 복원되면 안 됨");

const chat = restored!.chats[minsu!.id];
assert(chat && chat.length === 2, "인터뷰 로그 복원 실패");
assert.strictEqual(chat[0].role, "author");
assert.strictEqual(chat[0].text, "요즘 어때?");
assert.strictEqual(chat[1].role, "char");
assert.strictEqual(chat[1].text, "그럭저럭이요");
assert.strictEqual(chat[1].inner, "사실 지쳤다", "속마음 복원 실패");

const team = restored!.groups.find((g) => g.name === "형사팀");
assert(team, "형사팀 복원 실패");
assert.strictEqual(team!.description, "민수가 속한 조직", "집단 설명 위키링크 복원 실패");
assert.deepStrictEqual(team!.memberIds, [minsu!.id], "집단 구성원 복원 실패");

const grade1 = restored!.groups.find((g) => g.name === "1학년");
const school = restored!.groups.find((g) => g.name === "학교");
assert(grade1 && school && grade1.parentId === school.id, "집단 상위/하위 트리 복원 실패");

const fact = restored!.facts[0];
assert(fact, "사실 복원 실패");
assert.strictEqual(fact.content, "준호가 범인이다", "사실 내용 복원 실패");
assert.deepStrictEqual(fact.access[minsu!.id], { status: "misbelieves", misbelief: "영희가 범인이다" }, "오해 상태 복원 실패");
const younghee = restored!.personas.find((p) => p.name === "영희")!;
assert.strictEqual(younghee.gender, "custom", "성별 미설정 기본값 복원 실패");
assert.deepStrictEqual(fact.access[younghee.id], { status: "knows" }, "앎 상태 복원 실패");

assert.strictEqual(restored!.story.length, 2, "이야기 노드 개수 복원 실패");
assert.strictEqual(restored!.story[0].role, "direction");
assert.strictEqual(restored!.story[0].text, "테스트 방향");
assert.strictEqual(restored!.story[1].role, "story");
assert.strictEqual(restored!.story[1].text, "테스트 본문");
assert.strictEqual(restored!.storyCurrentId, restored!.story[1].id, "이야기 활성 지점 복원 실패");

assert.strictEqual(minsu!.imageWidth, 800, "이미지 원본 너비 복원 실패");
assert.strictEqual(minsu!.imageHeight, 600, "이미지 원본 높이 복원 실패");
assert.deepStrictEqual(minsu!.imagePosition, { x: 60, y: 30 }, "이미지 자르기 위치 복원 실패");

assert.strictEqual(restored!.personaRelations.length, 1, "캐릭터 관계 복원 실패");
const pr = restored!.personaRelations[0];
assert.strictEqual(pr.score, 15);
assert.strictEqual(pr.mutual, false, "단방향 여부 복원 실패");
assert.strictEqual(pr.aId, minsu!.id);
assert.strictEqual(pr.bId, younghee!.id);

assert.strictEqual(restored!.groupRelations.length, 1, "집단 관계 복원 실패");
assert.strictEqual(restored!.groupRelations[0].score, 70);

assert.strictEqual(restored!.personaGroupRelations.length, 1, "캐릭터-집단 관계 복원 실패");
const pgr = restored!.personaGroupRelations[0];
assert.strictEqual(pgr.personaId, younghee!.id);
assert.strictEqual(pgr.groupId, team!.id);
assert.strictEqual(pgr.personaAware, false, "비대칭 인지 복원 실패");

assert.strictEqual(restored!.chapters.length, 2, "목차 복원 실패");
const act1 = restored!.chapters.find((c) => c.title === "1막")!;
const scene1 = restored!.chapters.find((c) => c.title === "1장")!;
assert.strictEqual(act1.parentId, null, "최상위 챕터에 parentId가 붙으면 안 됨");
assert.strictEqual(scene1.parentId, act1.id, "챕터 트리(부모-자식) 복원 실패");
assert.deepStrictEqual(scene1.viewpoint, { mode: "firstProtagonist", narratorPersonaId: minsu!.id }, "챕터별 시점 오버라이드 복원 실패");

assert.strictEqual(restored!.foreshadows.length, 1, "떡밥 복원 실패");
const fs = restored!.foreshadows[0];
assert.strictEqual(fs.plantNodeId, restored!.story[0].id, "떡밥 설정 지점 노드 복원 실패");
assert.strictEqual(fs.resolveNodeId, restored!.story[1].id, "떡밥 회수 지점 노드 복원 실패");
assert.strictEqual(fs.plantText, "테스");
assert.strictEqual(fs.resolveText, "스트");

console.log("OK — round trip: 세계관/캐릭터/이미지/노트/인터뷰/집단 트리/사실/이야기/관계/목차·시점/떡밥 전부 복원 확인");
