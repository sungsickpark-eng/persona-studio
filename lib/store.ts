// MVP 저장소: localStorage. 유료 사용자는 saveProjects 끝에서 lib/cloudSync.ts를 통해 Supabase로도 동기화된다
// (무료 사용자는 이 파일만으로 예전과 동일하게 동작 — cloudSync는 로그인+구독 상태가 아니면 조용히 아무것도 안 함)
import { queueCloudSync } from "./cloudSync";
export type Access =
  | { status: "knows"; revealChapterId?: string } // revealChapterId 없으면 처음부터 앎, 있으면 그 챕터부터 앎(중간에 알게 됨)
  | { status: "unknown" } // 끝까지 모름
  | { status: "misbelieves"; misbelief: string };

export type Fact = {
  id: string;
  content: string; // 실제 사실 (작가만 아는 진실)
  access: Record<string, Access>; // personaId -> 공개 범위 (없으면 unknown = 작가만 앎)
};

export type Persona = {
  id: string;
  name: string;
  age: string;
  occupation: string;
  appearance: string; // 외형 요약
  personality: string;
  values: string;
  speech: string;
  backstory: string;
  goals: string;
  // 시간 흐름에 따라 이 캐릭터가 지향한/지향하는 것 (배경 서사·현재 목표와 별개로, 삶의 방향성 자체를 기록)
  past: string;
  present: string;
  future: string;
  triggers: string;
  notes: string[]; // 승인된 추가 설정만 기록 (버전 이력)
  createdAt: string; // 이 캐릭터를 도구에서 만든 실제 시각(ISO) — 순수 기록용, 이야기 속 등장 순서와는 무관하므로
  // 절대 AI 프롬프트에 넣거나 서술 순서 판단에 쓰지 말 것(작가가 나중에 만든 캐릭터가 이야기 맨 처음부터 있었을 수 있음)
  introChapterId: string | null; // 이 캐릭터가 이야기에 처음 등장하는 챕터 — null이면 처음부터 등장(제약 없음).
  // 이 챕터보다 앞선 지점을 쓸 때 이 캐릭터가 등장/언급되지 않도록 이야기 쓰기 AI에게 지시하는 데만 쓰임
  image?: string; // 캐릭터 디자인 (압축된 dataURL)
  imageWidth?: number; // 원본(압축 후) 이미지 픽셀 크기 — 정사각형/원형으로 자를 때 위치 계산용
  imageHeight?: number;
  imagePosition?: { x: number; y: number }; // 정사각형으로 자를 때 보여줄 위치 (0~100%, 기본 50/50=중앙)
  deleted?: boolean; // 소프트 삭제 — 휴지통에서 복구 가능
};

export type Group = {
  id: string;
  name: string;
  description: string; // 성격, 목적, 규율 등
  memberIds: string[]; // 소속 Persona id
  deleted?: boolean; // 소프트 삭제 — 휴지통에서 복구 가능
  parentId?: string; // 상위 집단 id (예: 학교 > 학년 > 학급 트리 구조)
  updatedAt?: string; // 마지막 수정 시각 (ISO). 생성 직후에는 없음 — 실제로 수정된 적이 있을 때만 기록
};

// 집단이 수정될 때마다 호출해 마지막 수정 시각을 남긴다
export function touchGroup(g: Group) {
  g.updatedAt = new Date().toISOString();
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

// 집단들을 부모-자식 트리의 깊이 우선 순서로 정렬한다. 부모가 목록에 없으면(삭제/미지정) 루트로 취급
export function groupTreeOrder(groups: Group[]): { group: Group; depth: number }[] {
  const ids = new Set(groups.map((g) => g.id));
  const byParent = new Map<string | undefined, Group[]>();
  for (const g of groups) {
    const key = g.parentId && ids.has(g.parentId) ? g.parentId : undefined;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(g);
    else byParent.set(key, [g]);
  }
  const out: { group: Group; depth: number }[] = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const g of byParent.get(parentId) ?? []) {
      out.push({ group: g, depth });
      visit(g.id, depth + 1);
    }
  };
  visit(undefined, 0);
  return out;
}

// newParentId를 groupId의 상위 집단으로 지정하면 순환이 생기는지 검사 (자기 자신이나 자손을 부모로 지정하는 것 방지)
export function wouldCreateCycle(groups: Group[], groupId: string, newParentId: string): boolean {
  if (groupId === newParentId) return true;
  let cur = groups.find((g) => g.id === newParentId);
  const seen = new Set<string>();
  while (cur?.parentId) {
    if (cur.parentId === groupId || seen.has(cur.parentId)) return true;
    seen.add(cur.parentId);
    cur = groups.find((g) => g.id === cur!.parentId);
  }
  return false;
}

// 캐릭터-캐릭터 또는 집단-집단 사이의 관계.
// aware가 false면 서로의 존재를 모르는 상태이며, 이때 score는 의미가 없다 (마지막 값을 보존만 함)
// mutual=true(기본, 양방향)면 aId/bId 둘 다 이 점수를 동일하게 느낀다. mutual=false(단방향)면
// 이 점수는 "aId가 bId에 대해" 느끼는 감정만을 뜻하며, bId → aId 방향은 이 레코드로는 정의되지 않는다
// (필요하면 aId/bId를 뒤바꾼 별도의 단방향 레코드를 추가해서 표현한다)
export type Relation = { id: string; aId: string; bId: string; score: number; aware: boolean; mutual: boolean };

// 양방향/단방향 구분 없이 aId-bId 쌍을 순서 무관하게 찾는다 (기존 양방향 관계 조회/중복 방지용)
export function findRelation(list: Relation[], aId: string, bId: string): Relation | undefined {
  return list.find((r) => (r.aId === aId && r.bId === bId) || (r.aId === bId && r.bId === aId));
}

// 단방향 관계는 aId->bId, bId->aId가 별개 레코드로 공존할 수 있어 순서를 정확히 맞춰 찾아야 한다
export function findDirectedRelation(list: Relation[], aId: string, bId: string): Relation | undefined {
  return list.find((r) => r.aId === aId && r.bId === bId);
}

export function relationLabel(aware: boolean, score: number): string {
  if (!aware) return "모름";
  if (score < 20) return "적대";
  if (score < 40) return "경계";
  if (score < 60) return "중립";
  if (score < 80) return "우호";
  return "각별";
}

// 캐릭터 ↔ 집단 관계. 소속 여부와 무관(소속 멤버도, 외부인도 가질 수 있음).
// personaAware/groupAware를 따로 둬서 한쪽만 아는 비대칭 관계(예: 조직이 감시 중인 인물이 그 사실을 모름)를 표현
export type PersonaGroupRelation = {
  id: string;
  personaId: string;
  groupId: string;
  score: number; // 1~100, 낮을수록 적대적
  personaAware: boolean; // 이 캐릭터가 이 집단의 존재를 아는가
  groupAware: boolean; // 이 집단(소속원들)이 이 캐릭터의 존재를 아는가
};

export function findPersonaGroupRelation(
  list: PersonaGroupRelation[],
  personaId: string,
  groupId: string,
): PersonaGroupRelation | undefined {
  return list.find((r) => r.personaId === personaId && r.groupId === groupId);
}

export function newPersonaGroupRelation(personaId: string, groupId: string, score = 50): PersonaGroupRelation {
  return { id: uid(), personaId, groupId, score, personaAware: true, groupAware: true };
}

// at은 이 메시지가 실제로 오간 시각(ISO) — 없으면(이 필드가 생기기 전 기록) "시간 미상"으로 취급.
// AI 기록 탭이 이야기(StoryNode)·인터뷰(Msg)를 하나의 시간순 목록으로 합칠 때 씀.
export type Msg = { role: "author" | "char"; text: string; inner?: string; at?: string };

// AI가 만들어낸 걸 사람이 승인해야만 공식 설정에 반영되는 항목들 — kind별로 승인 시 어디로 들어가는지가 다르다
// (app/p/[id]/page.tsx의 PendingTab 참고). personaNote는 인터뷰 중 나온 즉흥 설정, 나머지 셋은 이야기를 이어 쓸 때
// app/api/story/route.ts의 "extract" 모드가 뽑아낸 것.
export type Pending =
  | { id: string; kind: "personaNote"; personaId: string; text: string } // 승인 시 해당 캐릭터의 notes에 추가
  | { id: string; kind: "fact"; content: string } // 승인 시 새 Fact로 (지명 등 인물에 안 묶이는 것도 여기로)
  | { id: string; kind: "persona"; name: string; summary: string } // 승인 시 빈 캐릭터를 만들고 summary를 notes에 넣음
  | { id: string; kind: "group"; name: string; summary: string }; // 승인 시 빈 집단을 만들고 summary를 description에 넣음

// 세계관 설정 항목 — "세계관 설정.md" 문서의 5개 대분류(기본 규칙/사회 구조/지리·생활/역사/문화)를 그대로 따름
export type World = {
  overview: string; // 시대/장소 (한 줄 요약)
  // 1. 세계의 기본 규칙
  natureLaws: string; // 자연 법칙 & 기후
  magicSource: string; // 초자연적 요소: 힘의 근원
  magicCost: string; // 자원의 한계 및 대가
  magicLimits: string; // 절대 불가능한 규칙
  // 2. 사회 구조 & 권력 관계
  powerStructure: string; // 지배 계급과 정권 형태
  classSystem: string; // 계급 & 신분 제도
  lawAndPunishment: string; // 법과 징벌
  // 3. 지리 & 생활 양식
  geography: string; // 지리 & 교통
  lifestyle: string; // 의식주 & 자원
  economy: string; // 통화 & 경제
  // 4. 역사 & 집단 기억
  history: string; // 대변혁 사건
  rivalries: string; // 역사적 대립 구도
  taboos: string; // 금기와 전설
  // 5. 문화 & 가치관
  religion: string; // 종교 & 신앙
  morals: string; // 도덕 기준
  slang: string; // 속어 & 표현
};

// 스토리 전체의 장르 — 여러 개를 동시에 고를 수 있다(예: "무협"+"로맨스"). presets에 "기타"가 포함돼 있으면
// custom(자유 입력)을 그 자리에 대신 넣어서 라벨을 만든다.
// notes는 장르 자체가 아니라 그 장르 안에서의 톤·참고작품·지키거나 피하고 싶은 관습 등 부가 설정
export type Genre = { presets: string[]; custom: string; notes: string };

export const DEFAULT_GENRE: Genre = { presets: [], custom: "", notes: "" };

export function genreLabel(genre: Genre): string {
  return genre.presets
    .map((preset) => (preset === "기타" ? genre.custom.trim() || "기타" : preset))
    .join(" · ");
}

// 이야기를 막/장 등으로 정리하는 목차 트리. 서술 분기 트리(StoryNode)와는 별개 — 작가가 직접 구성하는 구조.
// 제목은 자유 문자열("1막", "3장" 등)이라 깊이 제한 없이 원하는 대로 중첩할 수 있다.
// viewpoint가 없으면 프로젝트 기본 시점을 그대로 따르고(inherit), 있으면 이 챕터(와 그 하위)에서 그 시점으로 덮어씀 —
// 자식이 직접 지정하지 않는 한 부모(막)의 지정을 물려받으므로 "1막은 전지적 작가, 그 안 2장만 민수 1인칭" 같은 구성이 가능
export type Chapter = { id: string; parentId: string | null; title: string; viewpoint?: Viewpoint };

// 챕터 목차를 부모-자식 깊이 우선 순서로 정렬 (groupTreeOrder와 같은 패턴)
export function chapterTreeOrder(chapters: Chapter[]): { chapter: Chapter; depth: number }[] {
  const byParent = new Map<string | null, Chapter[]>();
  for (const c of chapters) {
    const bucket = byParent.get(c.parentId);
    if (bucket) bucket.push(c);
    else byParent.set(c.parentId, [c]);
  }
  const out: { chapter: Chapter; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ chapter: c, depth });
      visit(c.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

// chapterTreeOrder의 순서를 "이야기 진행 순서"로 간주해 챕터의 순번을 매긴다(없는 챕터는 -1).
// 캐릭터의 등장 챕터(introChapterId)가 지금 쓰는 챕터보다 뒤인지 비교하는 데 씀
export function chapterOrderIndex(chapters: Chapter[], chapterId: string | null | undefined): number {
  if (!chapterId) return -1;
  return chapterTreeOrder(chapters).findIndex(({ chapter }) => chapter.id === chapterId);
}

// chapterId부터 최상위 막까지 거슬러 올라가 경로를 반환(예: [1막, 1장]) — "지금 쓰는 글이 어디 소속인지"를 한 줄로 보여줄 때 씀
export function chapterPath(chapters: Chapter[], chapterId: string | null | undefined): Chapter[] {
  if (!chapterId) return [];
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const path: Chapter[] = [];
  let cur = byId.get(chapterId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

// 지금 쓰는 챕터에 적용할 시점을 결정한다 — 그 챕터부터 최상위 막까지 거슬러 올라가며(자기 자신 먼저) 가장 가까운
// viewpoint 지정을 찾고, 아무 조상도 지정한 게 없으면 프로젝트 기본 시점(fallback)을 그대로 쓴다
export function resolveChapterViewpoint(chapters: Chapter[], chapterId: string | null | undefined, fallback: Viewpoint): Viewpoint {
  const path = chapterPath(chapters, chapterId); // [최상위, ..., 자기 자신] 순서 — 가까운 것부터 보려면 뒤에서부터
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].viewpoint) return path[i].viewpoint!;
  }
  return fallback;
}

// 챕터 목차 순서(chapterTreeOrder) 상에서 몇 번째인지 — "더 이른지/늦은지" 비교에 씀. 없으면 -1(가장 이른 것보다도 앞)
function chapterIndex(chapters: Chapter[], chapterId: string | null | undefined): number {
  if (!chapterId) return -1;
  return chapterTreeOrder(chapters).findIndex(({ chapter }) => chapter.id === chapterId);
}

// "knows" 상태인 사실이 주어진 시점(currentChapterId) 기준으로 이미 공개되었는지 판정.
// revealChapterId가 없으면 처음부터 앎(항상 공개). currentChapterId를 안 넘기면(시점 지정 없음) 항상 공개된 것으로 간주 — 시점을 안 따지던 기존 동작과 동일
export function isRevealed(access: Access, chapters: Chapter[], currentChapterId: string | null): boolean {
  if (access.status !== "knows") return false;
  if (!access.revealChapterId || !currentChapterId) return true;
  return chapterIndex(chapters, access.revealChapterId) <= chapterIndex(chapters, currentChapterId);
}

// 이야기 쓰기 로그. "direction"은 채택되거나 직접 입력한 전개 방향(작가 쪽), "story"는 젬마가 그 방향으로 써 내려간 소설체 본문.
// parentId로 트리를 이룬다 — 어느 지점에서든 다른 방향으로 다시 쓰면 그 지점에 새 가지(branch)가 생긴다(루트는 parentId=null)
// chapterId는 이 지점이 챕터 목차의 어느 막/장에 속하는지(작가가 직접 지정) — 서술 분기와 무관한 별도 태그
// at은 이 지점이 실제로 생성된 시각(ISO) — moveNode로 표시 순서(배열 순서)를 바꿔도 안 바뀌므로, AI 기록 탭이
// 인터뷰(Msg)와 섞어 진짜 시간순으로 정렬할 때는 배열 순서 대신 이 값을 쓴다. 없으면(이 필드가 생기기 전 기록) "시간 미상".
export type StoryNode = { id: string; parentId: string | null; role: "direction" | "story"; text: string; chapterId?: string; at?: string };

// storyCurrentId(현재 이어 쓰고 있는 지점)부터 루트까지 거슬러 올라가 활성 경로(뿌리→현재)를 반환
export function storyActivePath(story: StoryNode[], currentId: string | null): StoryNode[] {
  if (!currentId) return [];
  const byId = new Map(story.map((n) => [n.id, n]));
  const path: StoryNode[] = [];
  let cur = byId.get(currentId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

// 이야기 쓰기 중 선택한 문구를 "떡밥"(복선)으로 표시하고, 나중에 다른 선택 구간으로 회수 표시할 수 있게 함.
// 텍스트박스 안 글자에 직접 색을 입힐 수는 없어서(plain textarea라 인라인 서식 불가), 대신 지점 바로 아래 배지("떡밥1 설정"/"떡밥1 회수")로 표시하고
// "떡밥" 탭에서 전체 목록(설정 위치·회수 위치·미회수 여부)을 관리한다
export type Foreshadow = {
  id: string;
  number: number; // 떡밥1, 떡밥2... 표시용 번호 (삭제돼도 재사용 안 하도록 항상 max+1)
  plantNodeId: string;
  plantStart: number;
  plantEnd: number;
  plantText: string; // 선택 당시 스니펫 — 노드 텍스트가 나중에 편집되면 start/end가 밀릴 수 있어 표시는 이 스니펫 기준
  resolveNodeId?: string;
  resolveStart?: number;
  resolveEnd?: number;
  resolveText?: string;
};

// 이야기 쓰기의 서술 시점. omniscient(전지적 작가) 외 세 시점은 서술자가 다른 인물의 속마음을 알 수 없다는 제약이 프롬프트에 들어감.
// firstProtagonist/firstObserver는 "누구의 1인칭인지"가 필요해 narratorPersonaId로 지정(선택 안 했으면 그 모드로 못 씀)
export type ViewpointMode = "omniscient" | "thirdObserver" | "firstProtagonist" | "firstObserver";
export type Viewpoint = { mode: ViewpointMode; narratorPersonaId: string | null };

export const DEFAULT_VIEWPOINT: Viewpoint = { mode: "omniscient", narratorPersonaId: null };

// 국어 교과서 기준 4분류 — 클라이언트(선택 UI)와 서버(설정 충돌 검사 프롬프트) 양쪽에서 같은 라벨을 써야 해서 여기 하나로 둠
export const VIEWPOINT_LABEL: Record<ViewpointMode, string> = {
  omniscient: "전지적 작가 시점",
  thirdObserver: "3인칭 관찰자 시점",
  firstProtagonist: "1인칭 주인공 시점",
  firstObserver: "1인칭 관찰자 시점",
};

export type Project = {
  id: string;
  name: string;
  genre: Genre;
  world: World;
  personas: Persona[];
  groups: Group[];
  personaRelations: Relation[];
  groupRelations: Relation[];
  personaGroupRelations: PersonaGroupRelation[];
  facts: Fact[];
  chats: Record<string, Msg[]>; // personaId -> 인터뷰 로그
  pending: Pending[];
  story: StoryNode[]; // 세계관 전체를 바탕으로 이어 쓰는 이야기 트리
  storyCurrentId: string | null; // 지금 이어 쓰고 있는 지점(활성 리프) — 없으면 트리가 비어있음
  chapters: Chapter[]; // 막/장 등 이야기 목차 구성
  foreshadows: Foreshadow[]; // 떡밥(복선) 설정/회수 기록
  viewpoint: Viewpoint; // 이야기 쓰기 서술 시점
};

const KEY = "persona-studio";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const projects: Project[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    // 구버전 데이터 마이그레이션
    for (const p of projects) {
      p.groups ??= [];
      p.personaRelations ??= [];
      p.groupRelations ??= [];
      p.personaGroupRelations ??= [];
      p.story ??= [];
      p.storyCurrentId ??= null;
      p.chapters ??= [];
      p.foreshadows ??= [];
      p.pending ??= [];
      // 구버전 승인 대기 항목은 kind가 없었음(인터뷰의 캐릭터 메모 제안뿐이었으므로) -> "personaNote"로 채워줌
      for (const item of p.pending as (Pending & { kind?: Pending["kind"] })[]) item.kind ??= "personaNote";
      p.viewpoint ??= { ...DEFAULT_VIEWPOINT };
      p.genre ??= { ...DEFAULT_GENRE };
      // 구버전 장르(하나만 고르는 preset: string) -> 여러 개를 고르는 presets: string[]로 이전
      const legacyGenre = p.genre as Genre & { preset?: string };
      if (legacyGenre.presets === undefined) {
        legacyGenre.presets = legacyGenre.preset ? [legacyGenre.preset] : [];
        delete legacyGenre.preset;
      }
      // 구버전 세계관(setting/rules/taboos 3필드)을 5개 대분류 구조로 확장
      const legacyWorld = p.world as World & { setting?: string; rules?: string };
      legacyWorld.overview ??= legacyWorld.setting ?? "";
      legacyWorld.natureLaws ??= legacyWorld.rules ?? "";
      legacyWorld.magicSource ??= "";
      legacyWorld.magicCost ??= "";
      legacyWorld.magicLimits ??= "";
      legacyWorld.powerStructure ??= "";
      legacyWorld.classSystem ??= "";
      legacyWorld.lawAndPunishment ??= "";
      legacyWorld.geography ??= "";
      legacyWorld.lifestyle ??= "";
      legacyWorld.economy ??= "";
      legacyWorld.history ??= "";
      legacyWorld.rivalries ??= "";
      legacyWorld.taboos ??= "";
      legacyWorld.religion ??= "";
      legacyWorld.morals ??= "";
      legacyWorld.slang ??= "";
      delete legacyWorld.setting;
      delete legacyWorld.rules;
      // 구버전 "이야기"는 트리가 아니라 단순 배열(id/parentId 없음)이었음 -> 일직선 트리로 변환
      const legacyStory = p.story as unknown as { id?: string; parentId?: string | null; role: "direction" | "story"; text: string }[];
      if (legacyStory.length && legacyStory[0].id === undefined) {
        let prevId: string | null = null;
        for (const node of legacyStory) {
          node.id = uid();
          node.parentId = prevId;
          prevId = node.id;
        }
        p.storyCurrentId = prevId;
      }
      for (const r of [...p.personaRelations, ...p.groupRelations]) {
        r.aware ??= true;
        r.mutual ??= true;
      }
      for (const r of p.personaGroupRelations) {
        r.personaAware ??= true;
        r.groupAware ??= true;
      }
      // 구버전 "기본 정보" 통합 필드(basics) -> 나이/직업/외형 분리 필드로 이전
      for (const per of p.personas) {
        const legacy = per as Persona & { basics?: string };
        legacy.appearance ??= legacy.basics ?? "";
        legacy.age ??= "";
        legacy.occupation ??= "";
        delete legacy.basics;
        legacy.past ??= "";
        legacy.present ??= "";
        legacy.future ??= "";
        legacy.createdAt ??= ""; // 구버전 데이터는 실제 생성 시각을 알 수 없음 — 빈 값이면 UI가 "생성일 미상"으로 표시
        legacy.introChapterId ??= null;
      }
    }
    return projects;
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(projects));
  queueCloudSync(projects);
}

// 어떤 로컬 Ollama 모델을 쓸지는 프로젝트 데이터가 아니라 이 브라우저(로컬 환경) 전역 설정 — 프로젝트를 오가도 유지됨
const MODEL_KEY = "persona-studio-model";

export function loadSelectedModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MODEL_KEY) ?? "";
}

export function saveSelectedModel(model: string) {
  localStorage.setItem(MODEL_KEY, model);
}

// 어떤 AI(로컬 LLM 또는 클라우드 API)로 캐릭터 시뮬레이션·이야기 생성을 할지 — 프로젝트와 무관한 브라우저 전역 설정.
// 로컬 LLM은 모델 이름까지는 여기 안 담고(기존 loadSelectedModel/ModelPanel이 그대로 담당), 서버 주소만 여기서 관리한다.
// "included"는 키 입력이 필요 없는 구독 포함 AI — 서버가 자기 키로 대신 호출한다(lib/includedLlm.ts가 로그인/구독/월별
// 사용량 상한을 확인). 그 안에서 어떤 모델을 쓸지는 includedProvider로 고른다 — Claude는 단가가 비싸 포함 대상이 아니라
// openai/gemini 둘 중 하나뿐이다(lib/pricing.ts 참고).
export type LLMProvider = "ollama" | "included" | "openai" | "gemini" | "claude";
export type IncludedProvider = "openai" | "gemini";

export type LLMSettings = {
  provider: LLMProvider;
  includedProvider: IncludedProvider;
  ollamaUrl: string;
  openaiKey: string;
  openaiUrl: string;
  openaiModel: string;
  geminiKey: string;
  geminiUrl: string;
  geminiModel: string;
  claudeKey: string;
  claudeUrl: string;
  claudeModel: string;
};

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  provider: "ollama",
  includedProvider: "openai",
  ollamaUrl: "http://localhost:11434",
  openaiKey: "",
  openaiUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-4o-mini",
  geminiKey: "",
  geminiUrl: "https://generativelanguage.googleapis.com",
  geminiModel: "gemini-3.5-flash",
  claudeKey: "",
  claudeUrl: "https://api.anthropic.com",
  claudeModel: "claude-sonnet-5",
};

const LLM_SETTINGS_KEY = "persona-studio-llm-settings";

export function loadLLMSettings(): LLMSettings {
  if (typeof window === "undefined") return DEFAULT_LLM_SETTINGS;
  try {
    const settings = { ...DEFAULT_LLM_SETTINGS, ...JSON.parse(localStorage.getItem(LLM_SETTINGS_KEY) ?? "{}") };
    // gemini-2.0-flash/gemini-2.5-flash가 차례로 API에서 내려간 뒤 남아있는 구버전 저장값을 새 기본값으로 교체
    if (["gemini-2.0-flash", "gemini-2.5-flash"].includes(settings.geminiModel)) {
      settings.geminiModel = DEFAULT_LLM_SETTINGS.geminiModel;
    }
    return settings;
  } catch {
    return DEFAULT_LLM_SETTINGS;
  }
}

export function saveLLMSettings(settings: LLMSettings) {
  localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(settings));
}

export function newProject(name: string): Project {
  return {
    id: uid(),
    name,
    genre: { ...DEFAULT_GENRE },
    world: {
      overview: "",
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
    personas: [],
    groups: [],
    personaRelations: [],
    groupRelations: [],
    personaGroupRelations: [],
    facts: [],
    chats: {},
    pending: [],
    story: [],
    storyCurrentId: null,
    chapters: [],
    foreshadows: [],
    viewpoint: { ...DEFAULT_VIEWPOINT },
  };
}

export function newPersona(name: string): Persona {
  return {
    id: uid(),
    name,
    age: "",
    occupation: "",
    appearance: "",
    personality: "",
    values: "",
    speech: "",
    backstory: "",
    goals: "",
    past: "",
    present: "",
    future: "",
    triggers: "",
    notes: [],
    createdAt: new Date().toISOString(),
    introChapterId: null,
  };
}

export function newGroup(name: string, parentId?: string): Group {
  return { id: uid(), name, description: "", memberIds: [], parentId };
}

export function newRelation(aId: string, bId: string, score = 50, aware = true, mutual = true): Relation {
  return { id: uid(), aId, bId, score, aware, mutual };
}
