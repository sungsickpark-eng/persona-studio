"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  chapterPath,
  chapterTreeOrder,
  findDirectedRelation,
  findPersonaGroupRelation,
  findRelation,
  formatDateTime,
  GENDER_LABEL,
  groupTreeOrder,
  loadLLMSettings,
  loadProjects,
  loadSelectedModel,
  newGroup,
  newPersona,
  newPersonaGroupRelation,
  newRelation,
  relationLabel,
  saveLLMSettings,
  saveProjects,
  saveSelectedModel,
  storyActivePath,
  touchGroup,
  uid,
  VIEWPOINT_LABEL,
  wouldCreateCycle,
  type Access,
  type Chapter,
  type Foreshadow,
  type LLMSettings,
  type Msg,
  type Pending,
  type Persona,
  type PersonaGender,
  type Project,
  type Relation,
  type StoryNode,
  type ViewpointMode,
} from "@/lib/store";
import { saveProjectToDir } from "@/lib/export";
import { getStoredRootHandle, hasWritePermission, reconnectRootFolder } from "@/lib/rootFolder";
import type { FSDirHandle } from "@/lib/fs-types";
import RelationshipGraph from "./RelationshipGraph";
import ThemeToggle from "@/components/ThemeToggle";
import AuthBadge from "@/components/AuthBadge";
import { useSubscription } from "@/components/AuthProvider";
import { MONTHLY_CALL_CAP } from "@/lib/pricing";

const TABS = ["장르", "세계관", "사실·비밀", "캐릭터", "집단", "관계", "인터뷰", "떡밥", "AI 기록", "승인함", "삭제됨"] as const;

// Ollama에 연결이 안 될 때(fetch 자체가 실패)의 공통 안내 — 배포된 사이트에서는 이 브라우저가 자신의 Ollama로
// 직접 접속하는 구조라, Ollama 쪽에서 이 사이트 주소를 허용(OLLAMA_ORIGINS)하지 않았으면 CORS로 막힘. 매번 다시 찾아보지
// 않도록 지금 이 사이트의 실제 주소를 넣은, 그대로 터미널에 복붙 가능한 명령까지 메시지에 포함시킨다
const ollamaConnectHint = (url: string) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "이 사이트 주소";
  return `이 브라우저에서 Ollama(${url})에 연결할 수 없습니다. 이 컴퓨터에서 'ollama serve'가 실행 중인지 확인하고, 이 사이트가 배포된 주소에서 접속 중이라면(localhost가 아니라면) Ollama가 그 주소를 CORS로 막고 있을 수 있습니다 — 터미널에서 Ollama를 껐다가 아래 명령으로 다시 실행하세요:\n\nOLLAMA_ORIGINS=${origin} ollama serve`;
};

// /api/chat, /api/story 공용 호출기. provider가 로컬 LLM(Ollama)이면 서버가 요청만 조립해 `{ __ollamaRelay }`로 돌려주고
// (Vercel 같은 배포 환경에서 "localhost"가 서버 자신을 가리키는 문제 때문 — lib/llm.ts 상단 주석 참고), 이 함수가 그걸 받아
// 실제 fetch를 이 브라우저에서 직접 사용자의 Ollama로 보낸다. 그 외 provider는 서버가 이미 최종 결과를 응답해 그대로 반환.
async function postAI(path: "/api/chat" | "/api/story", body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청 실패");
  if (data.__ollamaRelay) {
    const { url, body: relayBody } = data.__ollamaRelay as { url: string; body: unknown };
    let ollamaRes: Response;
    try {
      ollamaRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(relayBody) });
    } catch {
      throw new Error(ollamaConnectHint(url));
    }
    if (!ollamaRes.ok) throw new Error(`Ollama ${ollamaRes.status}: ${await ollamaRes.text()}`);
    const ollamaData = await ollamaRes.json();
    return JSON.parse(ollamaData.message?.content ?? "{}");
  }
  return data;
}

// "이야기 쓰기" 챕터 카드에서 어느 챕터에도 안 속한 지점을 가리키는 특수 선택값 — 실제 챕터 id(uid())와 절대 겹치지 않음
const UNASSIGNED_CHAPTER = "__unassigned__";
type Tab = (typeof TABS)[number];

const GRAPH_RATIO_MIN = 0.2;
const GRAPH_RATIO_MAX = 0.75;

// 헤더 타이틀 세리프 처리 + 상단 탭 메뉴를 세그먼트 레일 스타일로 — /app 대시보드 리디자인과 같은 시각 언어(fuchsia 악센트) 재사용
const WORKSPACE_CSS = `
  .ws-serif { font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif; letter-spacing: -0.01em; }
  .ws-chrome-btn { transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease; }
  .ws-chrome-btn:hover { border-color: rgba(217, 70, 239, 0.45); transform: translateY(-1px); }
  .ws-tab-rail {
    padding: 4px;
    border-radius: 12px;
    border: 1px solid rgba(120, 113, 130, 0.16);
    background: color-mix(in srgb, currentColor 3%, transparent);
  }
  .ws-tab {
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    opacity: 0.7;
    transition: background 0.15s ease, opacity 0.15s ease, color 0.15s ease;
  }
  .ws-tab:hover { opacity: 1; background: rgba(217, 70, 239, 0.12); color: #d946ef; }
  @media (prefers-reduced-motion: reduce) {
    .ws-chrome-btn, .ws-tab { transition: none; }
    .ws-chrome-btn:hover { transform: none; }
  }

  /* 그래프/이야기 쓰기 두 칸은 드래그로 조절되는 비율(graphRatio)을 인라인 style={flexGrow}로 받는데,
     이 값은 JS 상태라 Tailwind sm: 접두사만으론 모바일에서 무효화가 안 됨 — 여기서 !important로 덮어써서
     "화면 하나에 억지로 분할"이 아니라 "각자 필요한 높이 + 페이지 전체 스크롤"로 바꿈.
     관계도는 h-full로 부모 높이를 그대로 물려받는 구조라(RelationshipGraph.tsx) 모바일에서도 명시적 높이가
     필요해 고정값(60vh)을 줌 — 이야기 쓰기 쪽은 내용에 맞춰 자연스러운 높이로 늘어나면 됨 */
  @media (max-width: 639px) {
    .ws-graph-wrap { flex: none !important; height: 60vh !important; min-height: 320px; }
    .ws-story-wrap { flex: none !important; height: auto !important; }
  }
`;

export default function Workspace() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  // null = 팝업 닫힘(관계도 지도만 표시). 값이 있으면 그 탭이 팝업으로 뜬다.
  const [tab, setTab] = useState<Tab | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // 떡밥 탭에서 설정/회수 지점을 클릭하면 이 값을 세팅 → 팝업을 닫고 항상 떠 있는 이야기 쓰기창(StoryTab)이 그 지점으로 스크롤+강조
  const [jumpNodeId, setJumpNodeId] = useState<string | null>(null);
  // 관계도가 차지하는 세로 비율(나머지는 이야기 쓰기창) — 구분선을 드래그해 조절
  const [graphRatio, setGraphRatio] = useState(0.45);
  const splitRef = useRef<HTMLDivElement>(null);
  // 연결된 저장 폴더(메인 화면에서 설정) — 있으면 이야기가 바뀔 때마다 그 폴더에 조용히 자동 저장.
  // folderStatus는 우측 상단 안내 배지용 — "none"이면 애초에 폴더를 안 연결한 것, "lost"면 연결은 해뒀는데 권한이 끊긴 것
  const rootHandleRef = useRef<FSDirHandle | null>(null);
  const [folderStatus, setFolderStatus] = useState<"none" | "connected" | "lost">("none");
  // 어떤 로컬 Ollama 모델을 쓸지 — 프로젝트 데이터가 아니라 이 브라우저 전역 설정(모든 프로젝트 공유)
  const [model, setModel] = useState(() => loadSelectedModel());
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const chooseModel = (name: string) => {
    saveSelectedModel(name);
    setModel(name);
  };
  // 캐릭터 시뮬레이션·이야기 생성에 로컬 LLM 대신 클라우드 API(OpenAI/Gemini/Claude)를 쓸지 — 역시 브라우저 전역 설정
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => loadLLMSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveLlm = (s: LLMSettings) => {
    saveLLMSettings(s);
    setLlmSettings(s);
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1 || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    setGraphRatio(Math.min(GRAPH_RATIO_MAX, Math.max(GRAPH_RATIO_MIN, ratio)));
  };

  useEffect(() => {
    setProject(loadProjects().find((p) => p.id === id) ?? null);
  }, [id]);

  useEffect(() => {
    getStoredRootHandle().then(async (h) => {
      rootHandleRef.current = h;
      if (h) setFolderStatus((await hasWritePermission(h)) ? "connected" : "lost");
    });
  }, []);

  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTab(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  if (!project)
    return (
      <main className="p-8">
        프로젝트를 찾을 수 없습니다. <Link href="/app" className="underline">홈으로</Link>
      </main>
    );

  // 모든 변경은 이 함수를 거쳐 localStorage에 즉시 반영.
  // 클로저의 낡은 project가 아니라 저장소의 최신 상태를 기준으로 변경한다 (비동기 응답 경합 방지)
  const update = (fn: (p: Project) => void) => {
    const next = structuredClone(loadProjects().find((p) => p.id === project.id) ?? project);
    fn(next);
    const all = loadProjects().map((p) => (p.id === next.id ? next : p));
    saveProjects(all);
    setProject(next);
  };

  // 이야기가 바뀔 때마다 StoryTab이 호출 — 연결된 저장 폴더가 있고 권한이 살아있으면 조용히 프로젝트 전체를 다시 저장.
  // 권한이 끊겼거나 폴더 연결이 아예 없으면 알림 없이 그냥 건너뜀(자동 저장이 매번 실패 팝업을 띄우면 방해만 됨).
  const autosaveStory = () => {
    const handle = rootHandleRef.current;
    if (!handle) return;
    hasWritePermission(handle)
      .then((ok) => {
        setFolderStatus(ok ? "connected" : "lost");
        if (!ok) return;
        const latest = loadProjects().find((p) => p.id === project.id);
        return latest && saveProjectToDir(handle, latest);
      })
      .catch(() => {});
  };

  const reconnectFolder = async () => {
    const handle = rootHandleRef.current;
    if (!handle) return;
    setFolderStatus((await reconnectRootFolder(handle)) ? "connected" : "lost");
  };

  return (
    <main className="flex min-h-screen flex-col p-4 sm:h-screen">
      <style>{WORKSPACE_CSS}</style>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-900">
        <div className="min-w-0">
          <Link
            href="/app"
            className="inline-flex items-center gap-1 text-xs text-gray-400 transition hover:text-fuchsia-600 dark:hover:text-fuchsia-400"
          >
            ← 프로젝트 목록
          </Link>
          <h1 className="ws-serif truncate text-2xl font-bold">{project.name}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {folderStatus === "connected" && (
            <span
              title="이야기가 바뀔 때마다 연결된 저장 폴더에 조용히 자동 저장됩니다"
              className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              자동 저장 켜짐
            </span>
          )}
          {folderStatus === "lost" && (
            <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              자동 저장 연결 끊김 —{" "}
              <button onClick={reconnectFolder} className="underline">
                다시 연결
              </button>
            </span>
          )}
          {folderStatus === "none" && (
            <span
              title="메인 화면에서 저장 폴더를 연결하면 이야기가 바뀔 때마다 자동으로 저장됩니다"
              className="whitespace-nowrap text-xs text-gray-400"
            >
              자동 저장 꺼짐
            </span>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            title="캐릭터 시뮬레이션·이야기 생성에 쓸 AI(로컬 LLM 또는 OpenAI/Gemini/Claude API)를 설정합니다"
            className="ws-chrome-btn whitespace-nowrap rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-800"
          >
            설정 · {PROVIDER_LABEL[llmSettings.provider]}
          </button>
          {llmSettings.provider === "ollama" && (
            <button
              onClick={() => setModelPanelOpen(true)}
              title="캐릭터 시뮬레이션에 쓸 로컬 Ollama 모델을 고르거나 새로 받습니다"
              className="ws-chrome-btn whitespace-nowrap rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-800"
            >
              모델: {model || "기본값"}
            </button>
          )}
          <AuthBadge />
          <ThemeToggle className="ws-chrome-btn shrink-0 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm dark:border-gray-800" />
        </div>
      </header>

      {modelPanelOpen && (
        <ModelPanel current={model} ollamaUrl={llmSettings.ollamaUrl} onChoose={chooseModel} onClose={() => setModelPanelOpen(false)} />
      )}
      {settingsOpen && <SettingsPanel settings={llmSettings} onSave={saveLlm} onClose={() => setSettingsOpen(false)} />}

      <nav className="ws-tab-rail mt-3 flex shrink-0 flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="ws-tab">
            {t}
            {t === "승인함" && project.pending.length > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{project.pending.length}</span>
            )}
            {t === "삭제됨" && trashCount(project) > 0 && (
              <span className="ml-1 rounded-full bg-gray-400 px-1.5 text-xs text-white">{trashCount(project)}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-3 shrink-0">
        <StoryTimeline project={project} />
      </div>

      {/* 관계도를 지도처럼 화면에 가장 크게 표시 — 나머지 설정은 아래 팝업으로 뜬다.
          모바일(sm 미만)에서는 그래프+이야기 쓰기 영역을 한 화면 높이에 억지로 욱여넣지 않고(그러면 이야기 쓰기
          칸이 다른 영역과 겹쳐 보임), 각자 필요한 높이만큼 자연스럽게 늘어나고 페이지 전체가 스크롤되게 함 —
          <main>·이 div는 sm: 접두사로 데스크톱에서만 고정 높이+분할, 그래프/이야기 두 칸의 인라인 flexGrow
          스타일(드래그로 조절되는 값이라 Tailwind 클래스만으론 반응형 처리가 안 돼)은 WORKSPACE_CSS의
          .ws-graph-wrap/.ws-story-wrap 모바일 미디어 쿼리로 무효화함 */}
      <div ref={splitRef} className="mt-3 flex flex-col sm:min-h-0 sm:flex-1 sm:overflow-hidden">
        {/* 틀(테두리) 크기는 고정 — 확대/축소는 그래프 안쪽에서 내용 자체를 줌하는 방식 (그래프 우상단 +/- 버튼) */}
        <div className="ws-graph-wrap min-h-0" style={{ flexGrow: graphRatio, flexBasis: 0 }}>
          <RelationshipGraph
            project={project}
            update={update}
            onSelect={(type, entityId) => {
              setTab(type === "persona" ? "캐릭터" : "집단");
              setFocusId(entityId);
            }}
          />
        </div>
        {/* 관계도와 이야기 쓰기창 사이 구분선 — 드래그해 두 영역의 세로 비율을 조절 (모바일에선 더 이상 분할 비율
            개념이 없어 숨김) */}
        <div
          onPointerDown={(e) => (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
          onPointerMove={onResizePointerMove}
          title="드래그해서 관계도와 이야기 쓰기창의 비율을 조절하세요"
          className="my-2 hidden h-3 shrink-0 cursor-row-resize items-center justify-center sm:flex"
        >
          <div className="h-1 w-16 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>
        {/* 관계도 아래에 항상 떠 있는 이야기 쓰기창 — 팝업을 열지 않고 바로 글을 이어 쓸 수 있음 */}
        <div
          className="ws-story-wrap mt-3 min-h-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:mt-0 dark:border-gray-800 dark:bg-gray-950"
          style={{ flexGrow: 1 - graphRatio, flexBasis: 0 }}
        >
          <StoryTab
            project={project}
            update={update}
            onStoryChanged={autosaveStory}
            model={model}
            llm={llmSettings}
            jumpNodeId={jumpNodeId}
            onJumped={() => setJumpNodeId(null)}
          />
        </div>
      </div>

      {tab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setTab(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <h2 className="text-lg font-bold">{tab}</h2>
              <button onClick={() => setTab(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                닫기 ✕
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {tab === "장르" && <GenreTab project={project} update={update} />}
              {tab === "세계관" && <WorldTab project={project} update={update} />}
              {tab === "사실·비밀" && <FactsTab project={project} update={update} />}
              {tab === "캐릭터" && <PersonasTab project={project} update={update} focusId={focusId} />}
              {tab === "집단" && <GroupsTab project={project} update={update} focusId={focusId} />}
              {tab === "관계" && <RelationsTab project={project} update={update} />}
              {tab === "인터뷰" && <InterviewTab project={project} update={update} model={model} llm={llmSettings} />}
              {tab === "떡밥" && (
                <ForeshadowsTab
                  project={project}
                  update={update}
                  onJumpToNode={(nodeId) => {
                    setJumpNodeId(nodeId);
                    setTab(null);
                  }}
                />
              )}
              {tab === "AI 기록" && <AiLogTab project={project} />}
              {tab === "승인함" && <PendingTab project={project} update={update} />}
              {tab === "삭제됨" && <TrashTab project={project} update={update} />}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// 본문에 "OOOO년"/"OOOO년 O월"/"OOOO년 O월 O일" 형태로 등장하는 날짜를 찾는다.
// 세계관마다 독자적인 연호(예: "제국력 305년")를 쓸 수 있어 숫자+년만 있어도 인식한다.
const DATE_RE = /(\d{1,4})년(?:\s*(\d{1,2})월)?(?:\s*(\d{1,2})일)?/g;

type TimelineEntry = { id: string; label: string; value: number; snippet: string };

// 텍스트 안 날짜를 연+월/12+일/365로 정렬 가능한 값으로 환산해 시간순으로 배치한다
function extractTimelineEntries(nodes: StoryNode[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const node of nodes) {
    for (const m of node.text.matchAll(DATE_RE)) {
      const idx = m.index ?? 0;
      // "3년 전"/"3년 후"/"3년 만에"처럼 상대적 시점 표현은 절대 연도가 아니므로 제외
      // (기준 시점이 따로 모델링되어 있지 않아 다른 절대 연도와 같은 축에 놓으면 눈금이 왜곡됨)
      if (/^\s*(전|후|만)/.test(node.text.slice(idx + m[0].length))) continue;
      const year = Number(m[1]);
      const month = m[2] ? Number(m[2]) : 1;
      const day = m[3] ? Number(m[3]) : 1;
      const start = Math.max(0, idx - 12);
      const end = Math.min(node.text.length, idx + m[0].length + 12);
      const snippet = `${start > 0 ? "…" : ""}${node.text.slice(start, end).trim()}${end < node.text.length ? "…" : ""}`;
      entries.push({ id: `${node.id}-${idx}`, label: m[0], value: year + (month - 1) / 12 + (day - 1) / 365, snippet });
    }
  }
  return entries.sort((a, b) => a.value - b.value);
}

// 관계도 위에 가로로 긴 타임라인 — 지금까지 쓴 이야기(활성 경로)에서 언급된 날짜/연도를 시간순으로 점 찍어 보여준다
function StoryTimeline({ project }: { project: Project }) {
  const entries = extractTimelineEntries(storyActivePath(project.story, project.storyCurrentId));

  if (entries.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-700">
        이야기에 &quot;2026년&quot;처럼 날짜·연도가 언급되면 여기에 타임라인으로 표시됩니다.
      </div>
    );
  }

  const min = entries[0].value;
  const max = entries[entries.length - 1].value;
  const span = max - min;

  return (
    <div className="h-20 overflow-x-auto rounded-xl border border-gray-200 bg-white px-8 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="relative h-full min-w-[600px]">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gray-300 dark:bg-gray-700" />
        {entries.map((e) => (
          <div
            key={e.id}
            title={e.snippet}
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${span === 0 ? 50 : ((e.value - min) / span) * 100}%` }}
          >
            <span className="mb-1 whitespace-nowrap text-[10px] text-gray-500 dark:text-gray-400">{e.label}</span>
            <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-fuchsia-500 shadow dark:border-gray-950" />
          </div>
        ))}
      </div>
    </div>
  );
}

type InstalledModel = { name: string; digest?: string; parameter_size?: string; size?: number };

// 오브시디언/허깅페이스 등에서 흔히 쓰이는, 알려진 오픈소스(오픈 웨이트) 모델 카탈로그 — 설치 안 돼 있으면 다운로드 버튼을 보여줌
const KNOWN_MODELS = [
  { name: "gemma4", label: "Gemma 4 (Google) — 기본값" },
  { name: "llama3.1", label: "Llama 3.1 (Meta)" },
  { name: "llama3.2", label: "Llama 3.2 (Meta, 경량)" },
  { name: "gemma2", label: "Gemma 2 (Google)" },
  { name: "gemma3", label: "Gemma 3 (Google)" },
  { name: "qwen2.5", label: "Qwen 2.5 (Alibaba)" },
  { name: "mistral", label: "Mistral 7B (Mistral AI)" },
  { name: "phi3", label: "Phi-3 (Microsoft)" },
  { name: "deepseek-r1", label: "DeepSeek R1" },
  { name: "codellama", label: "Code Llama (Meta)" },
] as const;

// ModelPanel·SettingsPanel 공용 — 작은 항목마다 반복되는 라벨/입력창/기본 버튼 스타일을 하나로 통일해
// (색상·포커스 상태 등 디자인 언어를) 두 패널 사이에서, 그리고 나머지 화면의 fuchsia 악센트와 일관되게 유지한다
function FieldLabel({ children }: { children: ReactNode }) {
  // uppercase를 쓰지 않는 이유: 라벨 안에 "Ollama"/"OpenAI" 같은 브랜드명이 그대로 들어있어서, 강제 대문자 변환을 쓰면
  // "OLLAMA"처럼 표기가 깨짐 — 자간(tracking-wide)만으로 소제목 느낌을 낸다
  return <p className="mb-1 text-xs font-semibold tracking-wide text-fuchsia-600 dark:text-fuchsia-400">{children}</p>;
}
const fieldInputCls =
  "w-full rounded border border-gray-200 px-2 py-1.5 outline-none transition focus:border-fuchsia-400 dark:border-gray-800 dark:bg-transparent";
const primaryBtnCls = "rounded bg-fuchsia-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-fuchsia-500";

// 로컬 Ollama에 설치된 모델을 보여주고 고르게 하거나, 카탈로그/직접 입력한 이름으로 새 모델을 받게 하는 패널

function ModelPanel({
  current,
  ollamaUrl,
  onChoose,
  onClose,
}: {
  current: string;
  ollamaUrl: string;
  onChoose: (name: string) => void;
  onClose: () => void;
}) {
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulling, setPulling] = useState<Record<string, number>>({}); // 모델 이름 -> 다운로드 진행률(0~100)
  const [customName, setCustomName] = useState("");
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatable, setUpdatable] = useState<Set<string>>(new Set());
  const url = ollamaUrl || "http://localhost:11434";

  // 이 패널이 서버(/api/models)를 거치지 않고 이 브라우저에서 Ollama로 직접 붙는 이유는 lib/llm.ts 상단 주석 참고 —
  // 배포된 사이트에서도 "로컬"이 각 사용자 자신의 컴퓨터가 되게 하려면 서버가 아니라 브라우저가 호출해야 함
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const models: InstalledModel[] = data.models ?? [];
      setInstalled(models);
      checkUpdates(models);
    } catch (e) {
      setError(e instanceof TypeError ? ollamaConnectHint(url) : e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // registry.ollama.ai는 사용자의 로컬 Ollama가 아니라 공개 인터넷 호스트라 서버(/api/ollama-registry-digest)를
  // 거쳐도 CORS·localhost 문제가 없음 — 실패해도(비공개/커스텀 모델, 오프라인 등) 조용히 배지만 안 뜨고 넘어감
  const checkUpdates = async (models: InstalledModel[]) => {
    if (models.length === 0) return;
    setCheckingUpdates(true);
    try {
      const res = await fetch("/api/ollama-registry-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refs: models.map((m) => m.name) }),
      });
      const data = await res.json();
      const digests = (data.digests ?? {}) as Record<string, string | null>;
      const next = new Set<string>();
      for (const m of models) {
        const remote = digests[m.name];
        if (remote && m.digest && remote !== m.digest) next.add(m.name);
      }
      setUpdatable(next);
    } catch {
      setUpdatable(new Set());
    } finally {
      setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const isInstalled = (name: string) => installed.some((m) => m.name === name || m.name.startsWith(`${name}:`));

  // Ollama의 /api/pull은 다운로드 진행률을 NDJSON 스트림으로 흘려보내므로, 줄 단위로 읽어 진행률(%)을 갱신한다
  const pull = async (name: string) => {
    setPulling((p) => ({ ...p, [name]: 0 }));
    setError("");
    try {
      let res: Response;
      try {
        res = await fetch(`${url}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: name, stream: true }),
        });
      } catch {
        throw new Error(ollamaConnectHint(url));
      }
      if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.error) throw new Error(evt.error);
          if (evt.total && evt.completed) setPulling((p) => ({ ...p, [name]: Math.round((evt.completed / evt.total) * 100) }));
        }
      }
      await refresh();
      onChoose(name); // 받은 모델은 바로 이어서 쓸 수 있게 선택까지 해준다
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPulling((p) => {
        const next = { ...p };
        delete next[name];
        return next;
      });
    }
  };

  const downloadable = KNOWN_MODELS.filter((m) => !isInstalled(m.name));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <h2 className="ws-serif text-xl font-bold">로컬 모델</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">닫기 ✕</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5 text-sm">
          <p className="text-gray-500">로컬 Ollama에 설치된 오픈소스 모델 중 골라 쓰거나, 아직 없는 모델은 받아서 바로 쓸 수 있습니다.</p>
          {error && <p className="whitespace-pre-wrap text-red-500">오류: {error}</p>}

          <div>
            <div className="mb-1 flex items-center gap-2">
              <FieldLabel>설치된 모델</FieldLabel>
              {checkingUpdates && <span className="text-xs text-gray-400">업데이트 확인 중…</span>}
            </div>
            {loading ? (
              <p className="text-gray-400">불러오는 중…</p>
            ) : installed.length === 0 ? (
              <p className="text-gray-400">설치된 모델이 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {installed.map((m) => (
                  <div
                    key={m.name}
                    className={`flex items-center justify-between rounded border px-3 py-1.5 transition ${
                      current === m.name
                        ? "border-fuchsia-400 bg-fuchsia-50 dark:border-fuchsia-500 dark:bg-fuchsia-950/30"
                        : "border-gray-200 dark:border-gray-800"
                    }`}
                  >
                    <button onClick={() => onChoose(m.name)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:opacity-80">
                      <span className="truncate">{m.name}</span>
                      {updatable.has(m.name) && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          새 버전 있음
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {updatable.has(m.name) &&
                        (m.name in pulling ? (
                          <span className="text-xs text-gray-400">받는 중… {pulling[m.name]}%</span>
                        ) : (
                          <button onClick={() => pull(m.name)} className="text-xs font-medium text-fuchsia-600 hover:underline dark:text-fuchsia-400">
                            업데이트
                          </button>
                        ))}
                      <span className="text-xs text-gray-400">
                        {m.parameter_size ?? ""} {m.size ? `· ${(m.size / 1e9).toFixed(1)}GB` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-900">
            <FieldLabel>받을 수 있는 모델 (오픈소스)</FieldLabel>
            <div className="space-y-1">
              {downloadable.map((m) => (
                <div key={m.name} className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5 dark:border-gray-800">
                  <span>{m.label}</span>
                  {m.name in pulling ? (
                    <span className="text-xs text-gray-400">받는 중… {pulling[m.name]}%</span>
                  ) : (
                    <button onClick={() => pull(m.name)} className="text-xs text-fuchsia-600 hover:underline dark:text-fuchsia-400">
                      다운로드
                    </button>
                  )}
                </div>
              ))}
              {downloadable.length === 0 && <p className="text-gray-400">목록에 있는 모델은 이미 다 설치돼 있습니다.</p>}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-900">
            <FieldLabel>직접 입력 (Ollama 라이브러리의 다른 모델)</FieldLabel>
            <div className="flex gap-2">
              <input
                className={`flex-1 ${fieldInputCls}`}
                placeholder='예: "llama3.3", "mixtral"'
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <button
                onClick={() => customName.trim() && pull(customName.trim())}
                disabled={!customName.trim() || customName.trim() in pulling}
                className={`${primaryBtnCls} shrink-0 px-3 py-1 text-xs disabled:opacity-40`}
              >
                다운로드
              </button>
            </div>
            {customName.trim() in pulling && <p className="mt-1 text-xs text-gray-400">받는 중… {pulling[customName.trim()]}%</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<LLMSettings["provider"], string> = {
  ollama: "로컬 LLM",
  included: "구독 포함 AI",
  openai: "OpenAI",
  gemini: "Google Gemini",
  claude: "Claude",
};

// 1인칭 두 모드는 "누구의 1인칭인지" 서술자 캐릭터 지정이 별도로 필요함 (라벨 자체는 lib/store.ts의 VIEWPOINT_LABEL — 서버 검사 프롬프트와 공유)
const VIEWPOINT_NEEDS_NARRATOR = (mode: ViewpointMode) => mode === "firstProtagonist" || mode === "firstObserver";

// 터미널 명령처럼 그대로 타이핑하기 번거로운 텍스트 옆에 붙여, 클릭 한 번으로 클립보드에 복사하는 작은 버튼
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("클립보드 복사에 실패했습니다. 직접 선택해서 복사해주세요.");
    }
  };
  return (
    <button
      onClick={copy}
      title="클립보드에 복사"
      className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      {copied ? "복사됨 ✓" : "복사"}
    </button>
  );
}

// AI 연동 설정 도구 — 로컬 LLM(Ollama) 서버 주소, Google Gemini/OpenAI/Claude의 API 주소·키를 입력하고
// 캐릭터 시뮬레이션·이야기 생성에 어떤 AI를 쓸지 고르는 패널. 로컬 LLM의 "어떤 모델"은 기존 ModelPanel이 그대로 담당
function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: LLMSettings;
  onSave: (s: LLMSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const set = <K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { isPaid } = useSubscription();

  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false);
  const [geminiModelsError, setGeminiModelsError] = useState("");
  const loadGeminiModels = async () => {
    setGeminiModelsLoading(true);
    setGeminiModelsError("");
    try {
      const res = await fetch("/api/gemini-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draft.geminiKey, url: draft.geminiUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
      setGeminiModels(data.models ?? []);
    } catch (e) {
      setGeminiModelsError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeminiModelsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <h2 className="ws-serif text-xl font-bold">AI 연동 설정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">닫기 ✕</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5 text-sm">
          <p className="text-gray-500">
            캐릭터 시뮬레이션·이야기 생성에 쓸 AI를 고르고, 각 서비스의 API 주소·키를 입력하세요. 이 브라우저에만 저장되며, 요청할 때만 서버로 전달됩니다.
          </p>

          <div>
            <FieldLabel>사용할 AI</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.entries(PROVIDER_LABEL) as [LLMSettings["provider"], string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => set("provider", value)}
                  className={`rounded border px-2.5 py-1.5 text-left transition ${
                    draft.provider === value
                      ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
                      : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {draft.provider !== "ollama" && draft.provider !== "included" && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              ⚠ {PROVIDER_LABEL[draft.provider]} API는 사용량에 따라 요금이 청구될 수 있습니다. 발생하는 비용은 이 API 키의 소유자
              본인 책임이며, 이 앱과 개발자는 그 비용에 대해 어떠한 책임도 지지 않습니다. 사용 전 해당 서비스의 요금제·한도를
              직접 확인하세요.
            </p>
          )}

          {draft.provider === "included" && (
            <div className="border-t border-gray-100 pt-4 dark:border-gray-900">
              {isPaid ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    API 키 없이 구독에 포함된 기본 AI를 월 {MONTHLY_CALL_CAP}회까지 바로 씁니다(두 모델 합산). 다 쓰면 안내와 함께
                    멈추니, 그 뒤엔 다른 탭에서 본인 API 키를 연결하면 계속 쓸 수 있습니다.
                  </p>
                  <div>
                    <FieldLabel>포함 AI 모델</FieldLabel>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([["openai", "ChatGPT (GPT-4o-mini)"], ["gemini", "Gemini (Flash)"]] as const).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => set("includedProvider", value)}
                          className={`rounded border px-2.5 py-1.5 text-left transition ${
                            draft.includedProvider === value
                              ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
                              : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded border border-fuchsia-300 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-700 dark:border-fuchsia-700 dark:bg-fuchsia-950/30 dark:text-fuchsia-300">
                  구독자 전용입니다. 키 발급 없이 바로 쓰고 싶다면{" "}
                  <Link href="/pricing" className="underline">
                    구독하기 →
                  </Link>
                </p>
              )}
            </div>
          )}

          {draft.provider === "ollama" && (
            <div className="border-t border-gray-100 pt-4 dark:border-gray-900">
              <FieldLabel>로컬 LLM(Ollama) 서버 주소</FieldLabel>
              <input
                className={fieldInputCls}
                placeholder="http://localhost:11434"
                value={draft.ollamaUrl}
                onChange={(e) => set("ollamaUrl", e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">
                이 주소로는 항상 <b>이 브라우저를 보고 있는 사람의 컴퓨터</b>가 직접 접속합니다(사이트가 배포돼 있어도 마찬가지) — 그러니 보통은
                기본값 그대로 두면 됩니다. 어떤 모델을 쓸지는 상단 헤더의 &quot;모델&quot; 버튼에서 고르거나 받습니다.
              </p>
              {origin && !origin.startsWith("http://localhost") && (
                <div className="mt-1 text-xs text-gray-400">
                  <p>
                    지금 이 사이트가 배포된 주소({origin})에서 접속 중이라, Ollama가 기본적으로 이 주소를 막습니다(CORS). 그
                    컴퓨터의 터미널에서 Ollama를 껐다가 아래 명령으로 다시 실행해야 연결됩니다:
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <code className="block flex-1 overflow-x-auto whitespace-nowrap rounded bg-gray-100 px-1.5 py-1 dark:bg-gray-900">
                      OLLAMA_ORIGINS={origin} ollama serve
                    </code>
                    <CopyButton text={`OLLAMA_ORIGINS=${origin} ollama serve`} />
                  </div>
                </div>
              )}
              <Link href="/ollama-setup" target="_blank" className="mt-1 inline-block text-xs text-fuchsia-600 hover:underline dark:text-fuchsia-400">
                자세한 설정 방법·에러 해결 보기 →
              </Link>
            </div>
          )}

          {draft.provider === "openai" && (
            <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-900">
              <div>
                <FieldLabel>OpenAI API 키</FieldLabel>
                <input
                  type="password"
                  className={fieldInputCls}
                  placeholder="sk-..."
                  value={draft.openaiKey}
                  onChange={(e) => set("openaiKey", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>API 주소</FieldLabel>
                <input
                  className={fieldInputCls}
                  placeholder="https://api.openai.com/v1"
                  value={draft.openaiUrl}
                  onChange={(e) => set("openaiUrl", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>모델</FieldLabel>
                <input
                  className={fieldInputCls}
                  placeholder="gpt-4o-mini"
                  value={draft.openaiModel}
                  onChange={(e) => set("openaiModel", e.target.value)}
                />
              </div>
            </div>
          )}

          {draft.provider === "gemini" && (
            <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-900">
              <div>
                <FieldLabel>Google Gemini API 키</FieldLabel>
                <input
                  type="password"
                  className={fieldInputCls}
                  placeholder="AIza..."
                  value={draft.geminiKey}
                  onChange={(e) => set("geminiKey", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>API 주소</FieldLabel>
                <input
                  className={fieldInputCls}
                  placeholder="https://generativelanguage.googleapis.com"
                  value={draft.geminiUrl}
                  onChange={(e) => set("geminiUrl", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>모델</FieldLabel>
                <div className="flex gap-1.5">
                  <input
                    className={fieldInputCls}
                    placeholder="gemini-3.5-flash"
                    value={draft.geminiModel}
                    onChange={(e) => set("geminiModel", e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!draft.geminiKey.trim() || geminiModelsLoading}
                    onClick={loadGeminiModels}
                    className="ws-chrome-btn shrink-0 rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-800"
                  >
                    {geminiModelsLoading ? "불러오는 중…" : "목록 불러오기"}
                  </button>
                </div>
                {geminiModelsError && <p className="mt-1 text-xs text-red-500">{geminiModelsError}</p>}
                {geminiModels.length > 0 && (
                  <select
                    className={`mt-1 text-xs ${fieldInputCls}`}
                    value=""
                    onChange={(e) => e.target.value && set("geminiModel", e.target.value)}
                  >
                    <option value="">이 키로 쓸 수 있는 모델 {geminiModels.length}개 — 고르면 위 칸에 채워짐</option>
                    {geminiModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {draft.provider === "claude" && (
            <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-900">
              <div>
                <FieldLabel>Claude API 키</FieldLabel>
                <input
                  type="password"
                  className={fieldInputCls}
                  placeholder="sk-ant-..."
                  value={draft.claudeKey}
                  onChange={(e) => set("claudeKey", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>API 주소</FieldLabel>
                <input
                  className={fieldInputCls}
                  placeholder="https://api.anthropic.com"
                  value={draft.claudeUrl}
                  onChange={(e) => set("claudeUrl", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>모델</FieldLabel>
                <input
                  className={fieldInputCls}
                  placeholder="claude-sonnet-5"
                  value={draft.claudeModel}
                  onChange={(e) => set("claudeModel", e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            취소
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className={primaryBtnCls}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

type TabProps = { project: Project; update: (fn: (p: Project) => void) => void };

const trashCount = (project: Project) =>
  project.personas.filter((p) => p.deleted).length + project.groups.filter((g) => g.deleted).length;

// 상위-하위로 지정되면 기본값(서로 앎, 50점)으로 관계를 만든다. 이미 수동으로 설정된 관계가 있으면 건드리지 않음
// (비밀 집단처럼 상하 관계이면서도 서로 모르게 하고 싶을 수 있어, "관계" 탭에서 언제든 수동으로 덮어쓸 수 있음)
function ensureGroupAwareness(p: Project, aId: string, bId: string) {
  if (!findRelation(p.groupRelations, aId, bId)) p.groupRelations.push(newRelation(aId, bId));
}

// "세계관 설정.md" 문서의 5개 대분류 구조를 그대로 따름
const WORLD_SECTIONS = [
  {
    title: "1. 세계의 기본 규칙",
    fields: [
      ["natureLaws", "자연 법칙 & 기후", "현실과 다른 점이 있는가? (예: 해가 2개 뜬다, 사계절이 없다, 특정 지역만 중력이 약하다)"],
      ["magicSource", "힘의 근원 (마법/기술 시스템)", "초자연적 힘이나 기술의 원천은 무엇인가"],
      ["magicCost", "자원의 한계 및 대가", "힘을 쓸 때 소모되는 것 (마력, 수명, 기계 부품 등)"],
      ["magicLimits", "절대 불가능한 규칙", "마법/초기술로도 절대 할 수 없는 일 — 스토리의 개연성을 지켜준다"],
    ],
  },
  {
    title: "2. 사회 구조 & 권력 관계",
    fields: [
      ["powerStructure", "지배 계급과 정권 형태", "왕정, 공화정, 기업 지배(사이버펑크), 신정일치 등"],
      ["classSystem", "계급 & 신분 제도", "사회적 약자와 강자는 어떻게 나뉘며, 이동이 가능한가"],
      ["lawAndPunishment", "법과 징벌", "무엇이 범죄로 취급되며, 어겼을 때 어떤 처벌을 받는가"],
    ],
  },
  {
    title: "3. 지리 & 생활 양식",
    fields: [
      ["geography", "지리 & 교통", "주요 도시, 위험 지역, 이동 수단(마차, 자율주행차, 워프 등) 및 걸리는 시간"],
      ["lifestyle", "의식주 & 자원", "주식(主食), 독특한 주거 형태, 해당 세계의 핵심 경제 자원"],
      ["economy", "통화 & 경제", "어떤 화폐를 쓰며, 물가는 어느 정도인가 (숙박비, 무기 가격 등)"],
    ],
  },
  {
    title: "4. 역사 & 집단 기억",
    fields: [
      ["history", "대변혁 사건", "세계를 바꾼 큰 전쟁, 재앙, 기술 혁명, 신의 등장 등"],
      ["rivalries", "역사적 대립 구도", "오랫동안 앙숙인 국가, 종족, 가문, 세력 간의 앙금"],
      ["taboos", "금기와 전설", "사람들이 두려워하거나 맹목적으로 믿는 신화나 금기 사항"],
    ],
  },
  {
    title: "5. 문화 & 가치관",
    fields: [
      ["religion", "종교 & 신앙", "존재하는 신이 있는가, 아니면 단순한 신앙인가? 교리는 무엇인가"],
      ["morals", "도덕 기준", "가장 명예롭게 여기는 가치(용맹, 지식, 부 등)와 가장 천대받는 행동"],
      ["slang", "속어 & 표현", '그 세계에서만 쓰이는 욕설, 인삿말, 숙어 (예: "제우스의 벼락을 맞을 놈!")'],
    ],
  },
] as const;

// "모든 장르"를 목표로 한 카탈로그 — 정통 장르부터 한국 웹소설에서 흔한 트로프(회귀물/빙의물/게임판타지 등)까지 포함.
// 목록에 없는 장르는 맨 끝의 "기타"를 골라 직접 입력
const GENRE_OPTIONS = [
  "판타지",
  "SF (공상과학)",
  "로맨스",
  "로맨스 판타지",
  "미스터리",
  "스릴러",
  "호러 (공포)",
  "무협",
  "무협 판타지",
  "사극·역사",
  "코미디",
  "드라마",
  "액션",
  "어드벤처 (모험)",
  "성장물",
  "느와르",
  "디스토피아",
  "포스트 아포칼립스",
  "하이틴",
  "학원물",
  "오컬트",
  "사이버펑크",
  "스팀펑크",
  "밀리터리·전쟁",
  "스포츠",
  "일상물 (힐링)",
  "범죄",
  "법정물",
  "의학물",
  "정치물",
  "재난",
  "좀비",
  "뱀파이어",
  "회귀물",
  "빙의물",
  "환생물",
  "게임판타지",
  "육아물",
  "첩보물",
  "라이트노벨풍",
] as const;

// 카드 배경/테두리/글자색(기본)과 선택 시 색을 완전한 클래스 문자열로 나열 — Tailwind JIT가 정적 문자열만 스캔하므로
// RelationshipGraph.tsx의 PALETTE와 같은 이유로 동적 템플릿(`border-${color}-200` 등)으로 바꾸면 스타일이 안 먹힘
const GENRE_COLORS = [
  { idle: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40", selected: "border-emerald-500 bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200 dark:ring-emerald-900" },
  { idle: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-900/40", selected: "border-sky-500 bg-sky-500 text-white shadow-sm ring-2 ring-sky-200 dark:ring-sky-900" },
  { idle: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40", selected: "border-amber-500 bg-amber-500 text-white shadow-sm ring-2 ring-amber-200 dark:ring-amber-900" },
  { idle: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40", selected: "border-rose-500 bg-rose-500 text-white shadow-sm ring-2 ring-rose-200 dark:ring-rose-900" },
  { idle: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40", selected: "border-indigo-500 bg-indigo-500 text-white shadow-sm ring-2 ring-indigo-200 dark:ring-indigo-900" },
  { idle: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40", selected: "border-teal-500 bg-teal-500 text-white shadow-sm ring-2 ring-teal-200 dark:ring-teal-900" },
  { idle: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-800 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:hover:bg-fuchsia-900/40", selected: "border-fuchsia-500 bg-fuchsia-500 text-white shadow-sm ring-2 ring-fuchsia-200 dark:ring-fuchsia-900" },
  { idle: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-900/40", selected: "border-orange-500 bg-orange-500 text-white shadow-sm ring-2 ring-orange-200 dark:ring-orange-900" },
  { idle: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300 dark:hover:bg-cyan-900/40", selected: "border-cyan-500 bg-cyan-500 text-white shadow-sm ring-2 ring-cyan-200 dark:ring-cyan-900" },
  { idle: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40", selected: "border-violet-500 bg-violet-500 text-white shadow-sm ring-2 ring-violet-200 dark:ring-violet-900" },
] as const;

const GENRE_CARD_BASE = "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors";
const GENRE_CARD_NEUTRAL_SELECTED =
  "border-gray-800 bg-gray-800 text-white shadow-sm dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900";
const GENRE_CARD_NEUTRAL_IDLE =
  "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800";

function GenreTab({ project, update }: TabProps) {
  const genre = project.genre;
  const toggle = (preset: string) =>
    update((p) => {
      const i = p.genre.presets.indexOf(preset);
      if (i === -1) p.genre.presets.push(preset);
      else p.genre.presets.splice(i, 1);
      if (!p.genre.presets.includes("기타")) p.genre.custom = "";
    });
  const clear = () => update((p) => void ((p.genre.presets = []), (p.genre.custom = "")));
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        이 스토리의 장르를 설정하면(여러 개 선택 가능) 인터뷰·이야기 쓰기에서 그 장르들의 문체·전개 관습을 참고합니다. 안
        골라도 진행에는 지장이 없습니다.
      </p>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">장르 (복수 선택 가능)</p>
          {genre.presets.length > 0 && (
            <button type="button" onClick={clear} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              선택 해제
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {GENRE_OPTIONS.map((g, i) => {
            const c = GENRE_COLORS[i % GENRE_COLORS.length];
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                className={`${GENRE_CARD_BASE} ${genre.presets.includes(g) ? c.selected : c.idle}`}
              >
                {g}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => toggle("기타")}
            className={`${GENRE_CARD_BASE} border-dashed ${genre.presets.includes("기타") ? GENRE_CARD_NEUTRAL_SELECTED : GENRE_CARD_NEUTRAL_IDLE}`}
          >
            기타 (직접 입력)
          </button>
        </div>
      </div>
      {genre.presets.includes("기타") && (
        <div>
          <p className="mb-1 text-sm font-semibold text-gray-600 dark:text-gray-300">장르 직접 입력</p>
          <input
            className="w-full rounded border px-2 py-1.5 text-sm"
            placeholder="예: 스페이스 오페라, 느와르 미스터리 등"
            value={genre.custom}
            onChange={(e) => update((p) => void (p.genre.custom = e.target.value))}
          />
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-semibold text-gray-600 dark:text-gray-300">기타 설정</p>
        <textarea
          className="min-h-[120px] w-full rounded border px-2 py-1.5 text-sm"
          placeholder="분위기·톤, 참고하고 싶은 작품, 이 장르에서 특히 지키거나 피하고 싶은 관습 등 자유롭게 적어주세요."
          value={genre.notes}
          onChange={(e) => update((p) => void (p.genre.notes = e.target.value))}
        />
      </div>
    </div>
  );
}

function WorldTab({ project, update }: TabProps) {
  const setField = (key: keyof Project["world"], value: string) => update((p) => void (p.world[key] = value));
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">세계관에 정의되지 않은 설정은 AI가 임의로 추가하지 못합니다.</p>
      <label className="block">
        <span className="text-sm font-medium">시대/장소 (한 줄 요약)</span>
        <textarea
          className="mt-1 w-full rounded border p-2"
          rows={2}
          placeholder="예: 조선 후기 한양"
          value={project.world.overview}
          onChange={(e) => setField("overview", e.target.value)}
        />
      </label>
      {WORLD_SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 className="font-semibold">{section.title}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {section.fields.map(([key, label, ph]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium">{label}</span>
                <textarea
                  className="mt-1 w-full rounded border p-2 text-sm"
                  rows={2}
                  placeholder={ph}
                  value={project.world[key]}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FactsTab({ project, update }: TabProps) {
  const activePersonas = project.personas.filter((p) => !p.deleted);
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    update((p) => p.facts.push({ id: uid(), content: text.trim(), access: {} }));
    setText("");
  };
  const setAccess = (factId: string, personaId: string, a: Access) =>
    update((p) => {
      const f = p.facts.find((f) => f.id === factId);
      if (f) f.access[personaId] = a;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        실제 사실을 등록하고, 캐릭터별로 <b>알고 있음 / 모름(작가만) / 오해함</b>을 지정하세요. 캐릭터가 모르는
        사실은 AI에게 전달되지 않습니다. &quot;알고 있음&quot;은 <b>처음부터 알았는지, 챕터 중간에 알게 됐는지</b>도
        고를 수 있습니다 — 인터뷰 탭에서 시점을 그 챕터 이전으로 두면 아직 모르는 것으로 취급됩니다.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder='실제 사실 (예: "준호가 범인이다")'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">추가</button>
      </div>
      {project.facts.map((f) => (
        <div key={f.id} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{f.content}</span>
            <button
              onClick={() => update((p) => void (p.facts = p.facts.filter((x) => x.id !== f.id)))}
              className="text-sm text-red-400 hover:text-red-600"
            >
              삭제
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {activePersonas.length === 0 && <p className="text-sm text-gray-400">캐릭터를 먼저 만드세요.</p>}
            {activePersonas.map((per) => {
              const a = f.access[per.id] ?? { status: "unknown" };
              return (
                <div key={per.id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0">{per.name}</span>
                  <select
                    className="rounded border px-2 py-1"
                    value={a.status}
                    onChange={(e) => {
                      const s = e.target.value as Access["status"];
                      setAccess(f.id, per.id, s === "misbelieves" ? { status: s, misbelief: "" } : { status: s });
                    }}
                  >
                    <option value="unknown">모름 (작가만) — 끝까지 모름</option>
                    <option value="knows">알고 있음</option>
                    <option value="misbelieves">오해함</option>
                  </select>
                  {a.status === "knows" && (
                    <select
                      className="rounded border px-2 py-1"
                      title="이 챕터에 도달하기 전까지는 인터뷰에서 아직 모르는 것으로 취급됩니다"
                      value={a.revealChapterId ?? ""}
                      onChange={(e) => setAccess(f.id, per.id, { status: "knows", revealChapterId: e.target.value || undefined })}
                    >
                      <option value="">처음부터 알게 됨</option>
                      {chapterTreeOrder(project.chapters).map(({ chapter, depth }) => (
                        <option key={chapter.id} value={chapter.id}>
                          {"　".repeat(depth)}
                          {chapter.title}부터 알게 됨 (중간에 알게 됨)
                        </option>
                      ))}
                    </select>
                  )}
                  {a.status === "misbelieves" && (
                    <input
                      className="flex-1 rounded border px-2 py-1"
                      placeholder='이 캐릭터가 진실이라 믿는 내용 (예: "민수가 범인이다")'
                      value={a.misbelief}
                      onChange={(e) => setAccess(f.id, per.id, { status: "misbelieves", misbelief: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// 떡밥(복선) 목록 — 이야기 쓰기에서 선택한 문구를 "떡밥 설정"/"떡밥 회수"로 표시하면 여기 모여 관리된다
function ForeshadowsTab({ project, update, onJumpToNode }: TabProps & { onJumpToNode: (nodeId: string) => void }) {
  const remove = (id: string) => update((p) => void (p.foreshadows = p.foreshadows.filter((f) => f.id !== id)));
  // 회수 표시만 취소하고 설정은 남겨둠(StoryTab의 배지 ✕와 동일한 동작)
  const unresolve = (id: string) =>
    update((p) => {
      const f = p.foreshadows.find((x) => x.id === id);
      if (f) Object.assign(f, { resolveNodeId: undefined, resolveStart: undefined, resolveEnd: undefined, resolveText: undefined });
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        이야기 쓰기에서 문구를 선택해 &quot;떡밥 설정&quot;으로 표시하면 여기 등록되고, 나중에 다른 문구를 선택해 그 떡밥을 &quot;회수&quot;로 표시할
        수 있습니다. 설정·회수 문구를 클릭하면 이야기 쓰기 창에서 그 지점으로 이동합니다.
      </p>
      {project.foreshadows.length === 0 && <p className="text-sm text-gray-400">아직 표시된 떡밥이 없습니다.</p>}
      {[...project.foreshadows]
        .sort((a, b) => a.number - b.number)
        .map((f) => (
          <div key={f.id} className="rounded border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">떡밥{f.number}</span>
              <button onClick={() => remove(f.id)} className="text-xs text-red-400 hover:text-red-600">
                삭제
              </button>
            </div>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              설정:{" "}
              <button
                onClick={() => onJumpToNode(f.plantNodeId)}
                title="이야기 쓰기에서 이 지점으로 이동"
                className="font-medium text-amber-600 hover:underline dark:text-amber-400"
              >
                &quot;{f.plantText}&quot;
              </button>
            </p>
            {f.resolveText && f.resolveNodeId ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-600 dark:text-gray-300">
                <span>
                  회수:{" "}
                  <button
                    onClick={() => onJumpToNode(f.resolveNodeId!)}
                    title="이야기 쓰기에서 이 지점으로 이동"
                    className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    &quot;{f.resolveText}&quot;
                  </button>
                </span>
                <button onClick={() => unresolve(f.id)} className="text-xs text-gray-400 hover:text-red-600">
                  회수 취소
                </button>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-gray-400">아직 회수되지 않음</p>
            )}
          </div>
        ))}
    </div>
  );
}

// 디자인 이미지를 512px 이하 JPEG dataURL로 압축 (localStorage 용량 보호). 자르기 위치 계산에 쓰도록 압축 후 크기도 같이 반환
function resizeImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// 원본 이미지 전체를 보여주고, 그 위에 실제로 잘려서 보일 정사각형 박스를 얹어 직접 드래그로 옮기게 함
// (object-fit:cover와 동일한 규칙: 가로/세로 중 더 긴 쪽으로만 박스가 움직일 여유가 생긴다)
function ImageCropBox({
  persona,
  update,
  onDone,
}: {
  persona: Persona;
  update: (fn: (p: Project) => void) => void;
  onDone: () => void;
}) {
  if (!persona.image || !persona.imageWidth || !persona.imageHeight) return null;
  const previewW = 200;
  const { imageWidth: imgW, imageHeight: imgH } = persona;
  const scale = previewW / imgW;
  const previewH = imgH * scale;
  const cropSize = Math.min(imgW, imgH) * scale;
  const fx = persona.imagePosition?.x ?? 50;
  const fy = persona.imagePosition?.y ?? 50;
  const maxOffsetX = previewW - cropSize;
  const maxOffsetY = previewH - cropSize;
  const boxLeft = maxOffsetX * (fx / 100);
  const boxTop = maxOffsetY * (fy / 100);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFx = fx;
    const startFy = fy;
    const onMove = (ev: PointerEvent) => {
      const newFx = maxOffsetX > 0 ? clamp(startFx + ((ev.clientX - startX) / maxOffsetX) * 100, 0, 100) : 50;
      const newFy = maxOffsetY > 0 ? clamp(startFy + ((ev.clientY - startY) / maxOffsetY) * 100, 0, 100) : 50;
      update((p) => {
        const t = p.personas.find((x) => x.id === persona.id);
        if (t) t.imagePosition = { x: newFx, y: newFy };
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">박스를 드래그해 잘릴 위치를 정하세요</span>
        <button onClick={onDone} className="text-xs text-fuchsia-600 hover:underline dark:text-fuchsia-400">
          완료
        </button>
      </div>
      <div className="relative mt-1 select-none rounded" style={{ width: previewW, height: previewH }}>
        {/* 어둡게 깔린 원본 전체 이미지 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={persona.image} alt="" draggable={false} className="absolute inset-0 h-full w-full brightness-50" />
        {/* 박스 안쪽만 밝게 보이도록 같은 이미지를 clip-path로 박스 모양만큼만 잘라 겹쳐 그림 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            clipPath: `inset(${boxTop}px ${previewW - boxLeft - cropSize}px ${previewH - boxTop - cropSize}px ${boxLeft}px)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={persona.image} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
        </div>
        <div
          onPointerDown={onPointerDown}
          className="absolute cursor-move border-2 border-fuchsia-400"
          style={{ left: boxLeft, top: boxTop, width: cropSize, height: cropSize }}
        />
      </div>
    </div>
  );
}

function PersonasTab({ project, update, focusId }: TabProps & { focusId?: string | null }) {
  const activePersonas = project.personas.filter((p) => !p.deleted);
  const activeGroups = project.groups.filter((g) => !g.deleted);
  const [name, setName] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  // 크롭 박스를 지금 열어둔 캐릭터 id — 썸네일 위치를 정하고 나면 "완료"로 닫혀 계속 안 보임, "위치 조정"으로 다시 열 수 있음
  const [cropOpenId, setCropOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    document.querySelector(`[data-persona-id="${focusId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId]);
  const add = () => {
    if (!name.trim()) return;
    const persona = newPersona(name.trim());
    update((p) => {
      p.personas.push(persona);
      for (const gid of groupIds) p.groups.find((g) => g.id === gid)?.memberIds.push(persona.id);
    });
    setName("");
    setGroupIds([]);
  };
  const basicFields = [
    ["age", "나이"],
    ["occupation", "직업"],
    ["appearance", "외형 요약"],
  ] as const;
  const fields = [
    ["personality", "성격", '예: "겉으론 냉정하지만 약자에게 약함"'],
    ["values", "가치관/신념", "무엇을 중요하게 여기는지, 절대 타협 못 하는 선"],
    ["speech", "말투/화법", "존댓말/반말, 자주 쓰는 표현, 침묵하는 상황"],
    ["oppositeSexView", "이성관", "이성을 대하는 태도·가치관, 이상형, 연애 성향 등"],
    ["backstory", "배경 서사", "과거 사건 중 현재 행동에 영향을 주는 것"],
    ["goals", "현재 목표/욕망", "이 시나리오 안에서 원하는 것"],
    ["past", "과거 지향점", "과거에 무엇을 추구하며 살았는가"],
    ["present", "현재 지향점", "지금 무엇을 향해 나아가고 있는가"],
    ["future", "미래 지향점", "앞으로 무엇을 이루고자 하는가"],
    ["triggers", "금기/트리거", "이 캐릭터를 자극하면 폭발하는 지점"],
  ] as const;

  const setImage = async (personaId: string, file: File | undefined) => {
    if (!file) return;
    try {
      const { dataUrl, width, height } = await resizeImage(file);
      update((p) => {
        const t = p.personas.find((x) => x.id === personaId);
        if (t) {
          t.image = dataUrl;
          t.imageWidth = width;
          t.imageHeight = height;
          t.imagePosition = { x: 50, y: 50 }; // 새 이미지는 중앙부터 시작
        }
      });
      setCropOpenId(personaId); // 새로 고른 이미지는 위치를 아직 안 정했으니 크롭 박스를 바로 열어줌
    } catch {
      alert("이미지를 읽을 수 없습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="새 캐릭터 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">추가</button>
      </div>
      {activeGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="text-xs text-gray-400">소속 집단</span>
          {activeGroups.map((g) => (
            <label key={g.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={(e) =>
                  setGroupIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((id) => id !== g.id)))
                }
              />
              {g.name}
            </label>
          ))}
        </div>
      )}
      {activePersonas.map((per) => {
        const myGroups = activeGroups.filter((g) => g.memberIds.includes(per.id));
        return (
          <details
            key={per.id}
            data-persona-id={per.id}
            className={`rounded border p-3 ${per.id === focusId ? "ring-2 ring-fuchsia-400" : ""}`}
            open={activePersonas.length === 1 || per.id === focusId}
          >
            <summary className="cursor-pointer font-semibold">
              {per.name}
              {myGroups.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400">{myGroups.map((g) => g.name).join(" · ")}</span>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`${per.name} 캐릭터를 삭제된 항목함으로 옮길까요? '삭제됨' 탭에서 복구할 수 있습니다.`))
                    update((p) => {
                      const t = p.personas.find((x) => x.id === per.id);
                      if (t) t.deleted = true;
                    });
                }}
                className="ml-3 text-sm font-normal text-red-400 hover:text-red-600"
              >
                삭제
              </button>
            </summary>

            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="text-sm font-medium">이름</span>
                <input
                  className="mt-1 w-full rounded border p-2 text-sm"
                  value={per.name}
                  onChange={(e) =>
                    update((p) => {
                      const t = p.personas.find((x) => x.id === per.id);
                      if (t) t.name = e.target.value;
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">성별</span>
                <select
                  className="mt-1 w-full rounded border p-2 text-sm dark:bg-transparent"
                  value={per.gender}
                  onChange={(e) =>
                    update((p) => {
                      const t = p.personas.find((x) => x.id === per.id);
                      if (t) t.gender = e.target.value as PersonaGender;
                    })
                  }
                >
                  {(Object.entries(GENDER_LABEL) as [PersonaGender, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {per.gender === "custom" && (
                  <input
                    className="mt-1 w-full rounded border p-2 text-sm"
                    placeholder="직접 입력 (예: 논바이너리, 밝히지 않음)"
                    value={per.genderCustom}
                    onChange={(e) =>
                      update((p) => {
                        const t = p.personas.find((x) => x.id === per.id);
                        if (t) t.genderCustom = e.target.value;
                      })
                    }
                  />
                )}
              </label>
              {basicFields.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium">{label}</span>
                  <input
                    className="mt-1 w-full rounded border p-2 text-sm"
                    value={per[key]}
                    onChange={(e) =>
                      update((p) => {
                        const t = p.personas.find((x) => x.id === per.id);
                        if (t) t[key] = e.target.value;
                      })
                    }
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <label className="flex items-center gap-1.5">
                <span>등장 챕터</span>
                <select
                  value={per.introChapterId ?? ""}
                  onChange={(e) =>
                    update((p) => {
                      const t = p.personas.find((x) => x.id === per.id);
                      if (t) t.introChapterId = e.target.value || null;
                    })
                  }
                  title="이 캐릭터가 이야기에 처음 등장하는 챕터. 지정하면 그 챕터보다 앞선 지점을 쓸 때 이야기 쓰기 AI가 이 캐릭터를 등장시키지 않습니다"
                  className="rounded border px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">처음부터 등장</option>
                  {chapterTreeOrder(project.chapters).map(({ chapter, depth }) => (
                    <option key={chapter.id} value={chapter.id}>
                      {"　".repeat(depth)}
                      {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
              <span>생성: {per.createdAt ? formatDateTime(per.createdAt) : "미상"}</span>
            </div>

            <div className="mt-3 flex items-start gap-3">
              {per.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={per.image}
                  alt={`${per.name} 디자인`}
                  className="h-28 w-28 rounded object-cover"
                  style={{ objectPosition: `${per.imagePosition?.x ?? 50}% ${per.imagePosition?.y ?? 50}%` }}
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed text-xs text-gray-400">
                  디자인 없음
                </div>
              )}
              <div className="text-sm">
                <label className="cursor-pointer rounded border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900">
                  {per.image ? "디자인 수정" : "디자인 업로드"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setImage(per.id, e.target.files?.[0])}
                  />
                </label>
                {per.image && (
                  <button
                    onClick={() =>
                      update((p) => {
                        const t = p.personas.find((x) => x.id === per.id);
                        if (t) {
                          delete t.image;
                          delete t.imageWidth;
                          delete t.imageHeight;
                          delete t.imagePosition;
                        }
                      })
                    }
                    className="ml-2 text-red-400 hover:text-red-600"
                  >
                    제거
                  </button>
                )}
                {per.image && cropOpenId !== per.id && (
                  <button
                    onClick={() => setCropOpenId(per.id)}
                    className="ml-2 text-fuchsia-600 hover:underline dark:text-fuchsia-400"
                  >
                    위치 조정
                  </button>
                )}
                <p className="mt-1 text-xs text-gray-400">내보내기 시 노트에 이미지가 포함됩니다.</p>
              </div>
            </div>
            {per.image && cropOpenId === per.id && (
              <div className="mt-3">
                <ImageCropBox persona={per} update={update} onDone={() => setCropOpenId(null)} />
              </div>
            )}

            {activeGroups.length > 0 && (
              <div className="mt-3">
                <span className="text-sm font-medium">소속 집단</span>
                <div className="mt-1 flex flex-wrap gap-3 text-sm">
                  {activeGroups.map((g) => (
                    <label key={g.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={g.memberIds.includes(per.id)}
                        onChange={(e) =>
                          update((p) => {
                            const t = p.groups.find((x) => x.id === g.id);
                            if (!t) return;
                            t.memberIds = e.target.checked
                              ? [...t.memberIds, per.id]
                              : t.memberIds.filter((m) => m !== per.id);
                            touchGroup(t);
                          })
                        }
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {fields.map(([key, label, ph]) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium">{label}</span>
                  <textarea
                    className="mt-1 w-full rounded border p-2 text-sm"
                    rows={2}
                    placeholder={ph}
                    value={per[key]}
                    onChange={(e) =>
                      update((p) => {
                        const t = p.personas.find((x) => x.id === per.id);
                        if (t) t[key] = e.target.value;
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {per.notes.length > 0 && (
              <div className="mt-3 text-sm">
                <span className="font-medium">승인된 추가 설정</span>
                <ul className="mt-1 list-disc pl-5 text-gray-600 dark:text-gray-300">
                  {per.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

function GroupsTab({ project, update, focusId }: TabProps & { focusId?: string | null }) {
  const activePersonas = project.personas.filter((p) => !p.deleted);
  const activeGroups = project.groups.filter((g) => !g.deleted);
  const tree = groupTreeOrder(activeGroups);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    if (!focusId) return;
    document.querySelector(`[data-group-id="${focusId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId]);
  const add = () => {
    if (!name.trim()) return;
    update((p) => {
      const g = newGroup(name.trim(), parentId || undefined);
      p.groups.push(g);
      if (parentId) ensureGroupAwareness(p, parentId, g.id);
    });
    setName("");
    setParentId("");
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        조직·세력·가문 등 집단을 정의하고 구성원을 지정하세요. 구성원 캐릭터의 프롬프트에 집단 정보가 포함됩니다.
        상위 집단을 지정하면 학교 &gt; 학년 &gt; 학급처럼 트리 구조로 표시되고, 기본적으로 상위·하위 집단은 서로의
        존재를 아는 것으로 설정됩니다(비밀 집단이라면 &ldquo;관계&rdquo; 탭에서 수동으로 &ldquo;존재를 모름&rdquo;으로 바꿀 수 있습니다).
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="새 집단 이름 (예: 포도청, 흑풍회)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        {activeGroups.length > 0 && (
          <select className="rounded border px-2 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">상위 집단 없음</option>
            {tree.map(({ group: g, depth }) => (
              <option key={g.id} value={g.id}>{"　".repeat(depth) + g.name}</option>
            ))}
          </select>
        )}
        <button onClick={add} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">추가</button>
      </div>
      {tree.map(({ group: g, depth }) => {
        const childCount = activeGroups.filter((x) => x.parentId === g.id).length;
        const validParents = activeGroups.filter((cand) => cand.id !== g.id && !wouldCreateCycle(activeGroups, g.id, cand.id));
        return (
          <details
            key={g.id}
            data-group-id={g.id}
            className={`rounded border p-3 ${g.id === focusId ? "ring-2 ring-fuchsia-400" : ""}`}
            style={{ marginLeft: depth * 20 }}
            open={activeGroups.length === 1 || g.id === focusId}
          >
            <summary className="cursor-pointer font-semibold">
              {depth > 0 && <span className="mr-1 text-gray-300 dark:text-gray-600">└</span>}
              {g.name}
              <span className="ml-2 text-sm font-normal text-gray-400">
                구성원 {g.memberIds.filter((m) => activePersonas.some((p) => p.id === m)).length}
                {childCount > 0 && ` · 하위 집단 ${childCount}`}
                {g.updatedAt && ` · 수정됨 ${formatDateTime(g.updatedAt)}`}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`${g.name} 집단을 삭제된 항목함으로 옮길까요? '삭제됨' 탭에서 복구할 수 있습니다.`))
                    update((p) => {
                      const t = p.groups.find((x) => x.id === g.id);
                      if (t) t.deleted = true;
                    });
                }}
                className="ml-3 text-sm font-normal text-red-400 hover:text-red-600"
              >
                삭제
              </button>
            </summary>
            <label className="mt-3 block">
              <span className="text-sm font-medium">이름</span>
              <input
                className="mt-1 block w-full rounded border p-2 text-sm"
                value={g.name}
                onChange={(e) =>
                  update((p) => {
                    const t = p.groups.find((x) => x.id === g.id);
                    if (t) {
                      t.name = e.target.value;
                      touchGroup(t);
                    }
                  })
                }
              />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-medium">상위 집단</span>
              <select
                className="mt-1 block rounded border px-2 py-1 text-sm"
                value={g.parentId ?? ""}
                onChange={(e) =>
                  update((p) => {
                    const t = p.groups.find((x) => x.id === g.id);
                    if (t) {
                      t.parentId = e.target.value || undefined;
                      touchGroup(t);
                      if (t.parentId) ensureGroupAwareness(p, t.parentId, t.id);
                    }
                  })
                }
              >
                <option value="">없음 (최상위)</option>
                {validParents.map((cand) => (
                  <option key={cand.id} value={cand.id}>{cand.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-medium">설명 (성격, 목적, 규율)</span>
              <textarea
                className="mt-1 w-full rounded border p-2 text-sm"
                rows={3}
                placeholder="이 집단은 무엇을 하고, 무엇을 믿고, 구성원에게 무엇을 요구하는가"
                value={g.description}
                onChange={(e) =>
                  update((p) => {
                    const t = p.groups.find((x) => x.id === g.id);
                    if (t) {
                      t.description = e.target.value;
                      touchGroup(t);
                    }
                  })
                }
              />
            </label>
            <div className="mt-3">
              <span className="text-sm font-medium">구성원</span>
              {activePersonas.length === 0 && <p className="text-sm text-gray-400">캐릭터를 먼저 만드세요.</p>}
              <div className="mt-1 flex flex-wrap gap-3">
                {activePersonas.map((per) => (
                  <label key={per.id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={g.memberIds.includes(per.id)}
                      onChange={(e) =>
                        update((p) => {
                          const t = p.groups.find((x) => x.id === g.id);
                          if (!t) return;
                          t.memberIds = e.target.checked
                            ? [...t.memberIds, per.id]
                            : t.memberIds.filter((m) => m !== per.id);
                          touchGroup(t);
                        })
                      }
                    />
                    {per.name}
                  </label>
                ))}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function RelationsTab({ project, update }: TabProps) {
  return (
    <div className="space-y-8">
      <RelationEditor
        title="캐릭터 간 관계"
        hint="두 캐릭터를 선택하고 관계 지수(1~100)를 설정하세요. 낮을수록 적대적, 높을수록 친밀합니다. 인터뷰 시 해당 캐릭터의 프롬프트에 반영됩니다. 기본은 양방향(서로 같은 감정)이며, 단방향으로 설정하면 A→B 한쪽만 이 감정을 가진 것으로 취급됩니다(예: 짝사랑, 일방적인 원한)."
        entities={project.personas}
        relations={project.personaRelations}
        onChange={(rels) => update((p) => void (p.personaRelations = rels))}
        directional
      />
      <RelationEditor
        title="집단 간 관계"
        hint="두 집단을 선택하고 관계 지수(1~100)를 설정하세요. 소속 캐릭터의 프롬프트에 반영됩니다."
        entities={project.groups}
        relations={project.groupRelations}
        onChange={(rels) => update((p) => void (p.groupRelations = rels))}
      />
      <PersonaGroupRelationEditor project={project} update={update} />
    </div>
  );
}

function PersonaGroupRelationEditor({ project, update }: TabProps) {
  const activePersonas = project.personas.filter((p) => !p.deleted);
  const activeGroups = project.groups.filter((g) => !g.deleted);
  const activePersonaIds = new Set(activePersonas.map((p) => p.id));
  const activeGroupIds = new Set(activeGroups.map((g) => g.id));
  const visible = project.personaGroupRelations.filter(
    (r) => activePersonaIds.has(r.personaId) && activeGroupIds.has(r.groupId),
  );
  const nameOfPersona = (id: string) => project.personas.find((p) => p.id === id)?.name ?? "?";
  const nameOfGroup = (id: string) => project.groups.find((g) => g.id === id)?.name ?? "?";

  const [personaId, setPersonaId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [score, setScore] = useState(50);
  const [personaAware, setPersonaAware] = useState(true);
  const [groupAware, setGroupAware] = useState(true);

  const add = () => {
    if (!personaId || !groupId) return;
    update((p) => {
      const existing = findPersonaGroupRelation(p.personaGroupRelations, personaId, groupId);
      if (existing) {
        existing.score = score;
        existing.personaAware = personaAware;
        existing.groupAware = groupAware;
      } else {
        const r = newPersonaGroupRelation(personaId, groupId, score);
        r.personaAware = personaAware;
        r.groupAware = groupAware;
        p.personaGroupRelations.push(r);
      }
    });
    setPersonaId("");
    setGroupId("");
    setScore(50);
    setPersonaAware(true);
    setGroupAware(true);
  };

  return (
    <section>
      <h3 className="font-semibold">캐릭터-집단 관계</h3>
      <p className="text-sm text-gray-500">
        소속 여부와 무관하게 캐릭터와 집단의 관계를 설정하세요. 캐릭터와 집단 각각 상대의 존재를 아는지 따로
        지정할 수 있어 &quot;조직은 이 인물을 감시 중이지만 인물은 조직의 존재를 모른다&quot; 같은 비대칭 관계도
        표현할 수 있습니다.
      </p>
      {activePersonas.length === 0 || activeGroups.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">캐릭터와 집단이 각각 하나 이상 있어야 설정할 수 있습니다.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select className="rounded border px-2 py-1" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            <option value="">캐릭터 선택</option>
            {activePersonas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="text-gray-400">↔</span>
          <select className="rounded border px-2 py-1" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">집단 선택</option>
            {activeGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input type="range" min={1} max={100} value={score} onChange={(e) => setScore(+e.target.value)} className="w-24" />
          <span className="w-8 text-right tabular-nums">{score}</span>
          <span className="w-10 text-gray-400">{relationLabel(true, score)}</span>
          <label className="flex items-center gap-1 text-gray-500">
            <input type="checkbox" checked={!personaAware} onChange={(e) => setPersonaAware(!e.target.checked)} />
            캐릭터가 집단을 모름
          </label>
          <label className="flex items-center gap-1 text-gray-500">
            <input type="checkbox" checked={!groupAware} onChange={(e) => setGroupAware(!e.target.checked)} />
            집단이 캐릭터를 모름
          </label>
          <button
            onClick={add}
            disabled={!personaId || !groupId}
            className="rounded bg-black px-3 py-1 text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            설정
          </button>
        </div>
      )}
      {visible.length > 0 && (
        <ul className="mt-3 space-y-1">
          {visible.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-40 shrink-0">{nameOfPersona(r.personaId)} ↔ {nameOfGroup(r.groupId)}</span>
              <input
                type="range"
                min={1}
                max={100}
                value={r.score}
                onChange={(e) =>
                  update((p) => {
                    const t = p.personaGroupRelations.find((x) => x.id === r.id);
                    if (t) t.score = +e.target.value;
                  })
                }
                className="w-24"
              />
              <span className="w-8 text-right tabular-nums">{r.score}</span>
              <span className="w-10 text-gray-400">{relationLabel(true, r.score)}</span>
              <label className="flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  checked={!r.personaAware}
                  onChange={(e) =>
                    update((p) => {
                      const t = p.personaGroupRelations.find((x) => x.id === r.id);
                      if (t) t.personaAware = !e.target.checked;
                    })
                  }
                />
                캐릭터가 모름
              </label>
              <label className="flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  checked={!r.groupAware}
                  onChange={(e) =>
                    update((p) => {
                      const t = p.personaGroupRelations.find((x) => x.id === r.id);
                      if (t) t.groupAware = !e.target.checked;
                    })
                  }
                />
                집단이 모름
              </label>
              <button
                onClick={() => update((p) => void (p.personaGroupRelations = p.personaGroupRelations.filter((x) => x.id !== r.id)))}
                className="text-red-400 hover:text-red-600"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RelationEditor({
  title,
  hint,
  entities,
  relations,
  onChange,
  directional = false,
}: {
  title: string;
  hint: string;
  entities: { id: string; name: string; deleted?: boolean }[];
  relations: Relation[];
  onChange: (r: Relation[]) => void;
  directional?: boolean;
}) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [score, setScore] = useState(50);
  const [aware, setAware] = useState(true);
  const [oneWay, setOneWay] = useState(false);
  const active = entities.filter((e) => !e.deleted);
  const activeIds = new Set(active.map((e) => e.id));
  const nameOf = (id: string) => entities.find((e) => e.id === id)?.name ?? "?";

  const add = () => {
    if (!aId || !bId || aId === bId) return;
    const mutual = !(directional && oneWay);
    // 단방향은 aId->bId, bId->aId가 별개로 공존해야 하므로 순서를 정확히 맞춰 찾는다.
    // 양방향은 기존처럼 순서 무관하게 찾아 덮어쓴다(중복 방지).
    const existing = mutual ? findRelation(relations, aId, bId) : findDirectedRelation(relations, aId, bId);
    onChange(
      existing
        ? relations.map((r) => (r.id === existing.id ? { ...r, score, aware, mutual } : r))
        : [...relations, newRelation(aId, bId, score, aware, mutual)],
    );
    setAId("");
    setBId("");
    setScore(50);
    setAware(true);
    setOneWay(false);
  };

  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-gray-500">{hint}</p>
      {active.length < 2 ? (
        <p className="mt-2 text-sm text-gray-400">두 개 이상 있어야 관계를 설정할 수 있습니다.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select className="rounded border px-2 py-1" value={aId} onChange={(e) => setAId(e.target.value)}>
            <option value="">{directional && oneWay ? "누가" : "선택"}</option>
            {active.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <span className="text-gray-400">{directional && oneWay ? "→" : "↔"}</span>
          <select className="rounded border px-2 py-1" value={bId} onChange={(e) => setBId(e.target.value)}>
            <option value="">{directional && oneWay ? "누구를" : "선택"}</option>
            {active
              .filter((e) => e.id !== aId)
              .map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
          </select>
          <input
            type="range"
            min={1}
            max={100}
            value={score}
            disabled={!aware}
            onChange={(e) => setScore(+e.target.value)}
            className="w-28 disabled:opacity-30"
          />
          <span className="w-8 text-right tabular-nums">{aware ? score : "—"}</span>
          <span className="w-10 text-gray-400">{relationLabel(aware, score)}</span>
          <label className="flex items-center gap-1 text-gray-500">
            <input type="checkbox" checked={!aware} onChange={(e) => setAware(!e.target.checked)} />
            존재를 모름
          </label>
          {directional && (
            <label className="flex items-center gap-1 text-gray-500">
              <input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} />
              단방향(A→B만 이 감정)
            </label>
          )}
          <button
            onClick={add}
            disabled={!aId || !bId || aId === bId}
            className="rounded bg-black px-3 py-1 text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            설정
          </button>
        </div>
      )}
      {relations.filter((r) => activeIds.has(r.aId) && activeIds.has(r.bId)).length > 0 && (
        <ul className="mt-3 space-y-1">
          {relations.filter((r) => activeIds.has(r.aId) && activeIds.has(r.bId)).map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0">
                {nameOf(r.aId)} {r.mutual ? "↔" : "→"} {nameOf(r.bId)}
              </span>
              <input
                type="range"
                min={1}
                max={100}
                value={r.score}
                disabled={!r.aware}
                onChange={(e) => onChange(relations.map((x) => (x.id === r.id ? { ...x, score: +e.target.value } : x)))}
                className="w-28 disabled:opacity-30"
              />
              <span className="w-8 text-right tabular-nums">{r.aware ? r.score : "—"}</span>
              <span className="w-10 text-gray-400">{relationLabel(r.aware, r.score)}</span>
              <label className="flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  checked={!r.aware}
                  onChange={(e) =>
                    onChange(relations.map((x) => (x.id === r.id ? { ...x, aware: !e.target.checked } : x)))
                  }
                />
                존재를 모름
              </label>
              {directional && (
                <label className="flex items-center gap-1 text-gray-500">
                  <input
                    type="checkbox"
                    checked={!r.mutual}
                    onChange={(e) =>
                      onChange(relations.map((x) => (x.id === r.id ? { ...x, mutual: !e.target.checked } : x)))
                    }
                  />
                  단방향
                </label>
              )}
              <button onClick={() => onChange(relations.filter((x) => x.id !== r.id))} className="text-red-400 hover:text-red-600">
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InterviewTab({ project, update, model, llm }: TabProps & { model: string; llm: LLMSettings }) {
  const activePersonas = project.personas.filter((p) => !p.deleted);
  const [personaId, setPersonaId] = useState(activePersonas[0]?.id ?? "");
  const [strength, setStrength] = useState(2);
  // 인터뷰 시점: 안 고르면(빈 값) 시점을 안 따지고 전부 공개(기존 동작). 챕터를 고르면 그 챕터까지 알게 된 사실만 보여줌
  const [interviewChapterId, setInterviewChapterId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const persona = activePersonas.find((p) => p.id === personaId);
  const chat = project.chats[personaId] ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, loading]);

  if (!persona) return <p className="text-sm text-gray-500">캐릭터 탭에서 먼저 캐릭터를 만드세요.</p>;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");
    setLoading(true);
    update((p) => {
      (p.chats[personaId] ??= []).push({ role: "author", text, at: new Date().toISOString() });
    });
    try {
      // 소속 집단 정보: 이름/설명/동료 구성원 이름 + 상위 집단 + 다른 집단과의 관계 + 우리 집단만 아는 외부 인물 (삭제된 집단/인물은 제외)
      const activeGroups = project.groups.filter((g) => !g.deleted);
      const groups = activeGroups
        .filter((g) => g.memberIds.includes(personaId))
        .map((g) => ({
          name: g.name,
          description: g.description,
          parent: activeGroups.find((x) => x.id === g.parentId)?.name ?? null,
          members: g.memberIds
            .map((id) => activePersonas.find((x) => x.id === id)?.name)
            .filter((n): n is string => !!n),
          relations: project.groupRelations
            .filter((r) => r.aId === g.id || r.bId === g.id)
            .map((r) => {
              const otherId = r.aId === g.id ? r.bId : r.aId;
              const other = activeGroups.find((x) => x.id === otherId);
              return other ? { with: other.name, score: r.score, aware: r.aware } : null;
            })
            .filter((x): x is { with: string; score: number; aware: boolean } => !!x),
          // 이 집단이 감시/기록 중이지만 상대는 이 집단의 존재를 모르는 외부 인물 (비대칭 관계의 "아는 쪽")
          watching: project.personaGroupRelations
            .filter((r) => r.groupId === g.id && r.groupAware && !r.personaAware && r.personaId !== personaId)
            .map((r) => {
              const other = activePersonas.find((x) => x.id === r.personaId);
              return other ? { name: other.name, score: r.score } : null;
            })
            .filter((x): x is { name: string; score: number } => !!x),
        }));
      // 이 캐릭터와 다른 캐릭터 사이의 관계. 단방향(mutual=false) 관계는 aId 쪽만 이 감정을 갖고 있으므로
      // 이 캐릭터가 받는(bId) 입장일 땐 제외 — 상대가 나를 어떻게 느끼는지 내가 자동으로 알지는 못함
      const relations = project.personaRelations
        .filter((r) => (r.aId === personaId || r.bId === personaId) && (r.mutual || r.aId === personaId))
        .map((r) => {
          const otherId = r.aId === personaId ? r.bId : r.aId;
          const other = activePersonas.find((x) => x.id === otherId);
          return other ? { name: other.name, score: r.score, aware: r.aware } : null;
        })
        .filter((x): x is { name: string; score: number; aware: boolean } => !!x);
      // 소속과 무관하게 이 캐릭터와 집단 사이의 관계 (캐릭터 쪽 인지 여부 기준)
      const groupRelations = project.personaGroupRelations
        .filter((r) => r.personaId === personaId)
        .map((r) => {
          const g = activeGroups.find((x) => x.id === r.groupId);
          return g ? { name: g.name, score: r.score, personaAware: r.personaAware } : null;
        })
        .filter((x): x is { name: string; score: number; personaAware: boolean } => !!x);
      const data = await postAI("/api/chat", {
        genre: project.genre,
        world: project.world,
        persona,
        groups,
        relations,
        groupRelations,
        facts: project.facts,
        chapters: project.chapters,
        currentChapterId: interviewChapterId || null,
        history: chat,
        strength,
        userMessage: text,
        model: model || undefined,
        llm,
      });
      update((p) => {
        (p.chats[personaId] ??= []).push({ role: "char", text: data.dialogue, inner: data.inner, at: new Date().toISOString() });
        for (const s of data.proposed_settings ?? []) p.pending.push({ id: uid(), kind: "personaNote", personaId, text: s });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label>
          캐릭터{" "}
          <select className="rounded border px-2 py-1" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            {activePersonas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          페르소나 강도 {strength}
          <input type="range" min={1} max={4} value={strength} onChange={(e) => setStrength(+e.target.value)} />
          <span className="text-gray-400">
            {["설정 참고", "성격 유지", "엄격한 역할", "완전 몰입"][strength - 1]}
          </span>
        </label>
        <label title="사실·비밀 탭에서 '중간에 알게 됨'으로 챕터를 지정한 사실은 여기서 고른 챕터까지 도달했을 때만 캐릭터가 아는 것으로 취급됩니다">
          시점{" "}
          <select
            className="rounded border px-2 py-1"
            value={interviewChapterId}
            onChange={(e) => setInterviewChapterId(e.target.value)}
          >
            <option value="">전체 공개 (시점 안 따짐)</option>
            {chapterTreeOrder(project.chapters).map(({ chapter, depth }) => (
              <option key={chapter.id} value={chapter.id}>
                {"　".repeat(depth)}
                {chapter.title}까지
              </option>
            ))}
          </select>
        </label>
        {chat.length > 0 && (
          <button
            onClick={() => confirm("대화를 초기화할까요?") && update((p) => void (p.chats[personaId] = []))}
            className="text-gray-400 hover:text-red-500"
          >
            대화 초기화
          </button>
        )}
      </div>

      <div className="mt-3 h-[26rem] space-y-3 overflow-y-auto rounded border p-3">
        {chat.length === 0 && <p className="text-sm text-gray-400">{persona.name}에게 무엇이든 물어보세요.</p>}
        {chat.map((m, i) => (
          <MsgView key={i} m={m} name={persona.name} image={persona.image} imagePosition={persona.imagePosition} />
        ))}
        {loading && <p className="text-sm text-gray-400">{persona.name}이(가) 생각 중…</p>}
        {error && <p className="whitespace-pre-wrap text-sm text-red-500">오류: {error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="작가로서 질문하거나 상황을 던지세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
        />
        <button onClick={send} disabled={loading} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black">
          보내기
        </button>
      </div>
    </div>
  );
}

function StoryTab({
  project,
  update: updateProject,
  onStoryChanged,
  model,
  llm,
  jumpNodeId,
  onJumped,
}: TabProps & { onStoryChanged: () => void; model: string; llm: LLMSettings; jumpNodeId: string | null; onJumped: () => void }) {
  // 이 탭 안의 모든 변경은 연결된 저장 폴더로의 자동 저장을 함께 트리거한다(onStoryChanged) — 호출부를 하나하나
  // 바꾸지 않고 update 자체를 감싸서, 이 탭에서 일어나는 모든 이야기 변경(생성·수정·삭제·되돌리기·순서 변경 등)에 일괄 적용
  const update = (fn: (p: Project) => void) => {
    updateProject(fn);
    onStoryChanged();
  };
  const [options, setOptions] = useState<string[]>([]);
  const [direction, setDirection] = useState("");
  const [loading, setLoading] = useState<"suggest" | "write" | null>(null);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  // 선택된 챕터가 있으면 글쓰기 란에 "전체 이야기"가 아니라 그 챕터에 태그된 내용만 보여준다 (없으면 전체 활성 경로)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  // 되돌리기: 페이지를 새로고침하면 사라지는 세션 한정 기록(프로젝트 데이터에는 저장 안 함). maxUndo개까지만 보관
  const [undoStack, setUndoStack] = useState<{ story: StoryNode[]; storyCurrentId: string | null }[]>([]);
  const [maxUndo, setMaxUndo] = useState(20);
  // 떡밥 각주를 클릭했을 때 잠깐 강조 표시할 지점 id
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 떡밥 각주를 클릭하면 그 지점으로 스크롤하고 잠깐 강조한다. 지금 보고 있는 챕터 필터에 그 지점이 없을 때만
  // "전체 스토리"로 전환해 보이게 만든다 — 무조건 전환하면, 지금 선택된 챕터에 이어 쓰는 중이었을 때 필터가 조용히
  // 풀려서(예: 인트로를 선택해 쓰다가 떡밥 각주 하나만 눌러도) 그 다음 "이어서 쓰기"가 미분류로 붙는 버그가 생김
  const scrollToNode = (nodeId: string) => {
    const node = project.story.find((n) => n.id === nodeId);
    const nodeChapterId = node?.chapterId ?? null;
    const visibleUnderCurrentFilter =
      selectedChapterId === null ||
      (selectedChapterId === UNASSIGNED_CHAPTER ? nodeChapterId === null : nodeChapterId === selectedChapterId);
    if (!visibleUnderCurrentFilter) setSelectedChapterId(null);
    setHighlightNodeId(nodeId);
  };

  // 1인칭 시점으로 바꿀 때 이전 서술자는 그대로 두고, 1인칭이 아닌 시점으로 바꾸면 서술자 지정을 비운다(다시 필요 없으므로)
  const setViewpointMode = (mode: ViewpointMode) =>
    update((p) => {
      p.viewpoint = { mode, narratorPersonaId: VIEWPOINT_NEEDS_NARRATOR(mode) ? p.viewpoint.narratorPersonaId : null };
    });
  const setNarrator = (personaId: string) =>
    update((p) => {
      p.viewpoint = { ...p.viewpoint, narratorPersonaId: personaId || null };
    });

  // 챕터별 시점 재정의 — mode가 빈 문자열이면 "기본값 사용"으로 되돌리는 것(그 챕터의 viewpoint 지정을 아예 지움)
  const setChapterViewpointMode = (chapterId: string, mode: ViewpointMode | "") =>
    update((p) => {
      const c = p.chapters.find((x) => x.id === chapterId);
      if (!c) return;
      if (!mode) {
        delete c.viewpoint;
        return;
      }
      c.viewpoint = { mode, narratorPersonaId: VIEWPOINT_NEEDS_NARRATOR(mode) ? (c.viewpoint?.narratorPersonaId ?? null) : null };
    });
  const setChapterNarrator = (chapterId: string, personaId: string) =>
    update((p) => {
      const c = p.chapters.find((x) => x.id === chapterId);
      if (c?.viewpoint) c.viewpoint = { ...c.viewpoint, narratorPersonaId: personaId || null };
    });

  // 떡밥 탭(다른 팝업)에서 설정/회수 문구를 클릭했을 때도 같은 방식으로 이동 — 팝업을 닫고 나면 부모가 jumpNodeId를 세팅해준다
  useEffect(() => {
    if (!jumpNodeId) return;
    const t = setTimeout(() => {
      scrollToNode(jumpNodeId);
      onJumped();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpNodeId]);

  useEffect(() => {
    if (!highlightNodeId) return;
    // 챕터 필터를 "전체 스토리"로 막 전환한 직후라 로그 목록이 다시 그려지는 중일 수 있음 — 레이아웃이
    // 자리잡기 전에 scrollIntoView를 부르면 조용히 아무 효과도 없을 수 있어 살짝 뒤로 미룸
    const timer = setTimeout(() => {
      document.querySelector(`[data-story-node-id="${highlightNodeId}"]`)?.scrollIntoView({ block: "center" });
    }, 50);
    const t = setTimeout(() => setHighlightNodeId(null), 1600);
    return () => {
      clearTimeout(timer);
      clearTimeout(t);
    };
  }, [highlightNodeId]);

  // story/storyCurrentId를 바꾸기 직전에 호출해 지금 상태를 스냅샷으로 남긴다
  const pushUndo = () => {
    setUndoStack((stack) => {
      const snapshot = { story: structuredClone(project.story), storyCurrentId: project.storyCurrentId };
      const next = [...stack, snapshot];
      return next.length > maxUndo ? next.slice(next.length - maxUndo) : next;
    });
  };

  const undo = () => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const last = stack[stack.length - 1];
      update((p) => {
        p.story = last.story;
        p.storyCurrentId = last.storyCurrentId;
      });
      return stack.slice(0, -1);
    });
  };

  const setMaxUndoClamped = (n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(100, Math.max(1, Math.round(n)));
    setMaxUndo(clamped);
    setUndoStack((stack) => (stack.length > clamped ? stack.slice(stack.length - clamped) : stack));
  };

  // 노드를 지우고 그 자식은 부모의 부모로 이어붙여 트리가 끊기지 않게 한다. 되돌리기로 복구 가능하니 확인창은 생략
  const deleteNode = (id: string) => {
    pushUndo();
    update((p) => {
      const node = p.story.find((n) => n.id === id);
      if (!node) return;
      for (const child of p.story) if (child.parentId === id) child.parentId = node.parentId;
      p.story = p.story.filter((n) => n.id !== id);
      if (p.storyCurrentId === id) p.storyCurrentId = node.parentId;
    });
  };

  // 미분류 지점을 특정 챕터로 옮긴다(되돌리기로 복구 가능)
  const assignChapter = (id: string, chapterId: string) => {
    pushUndo();
    update((p) => {
      const node = p.story.find((n) => n.id === id);
      if (node) node.chapterId = chapterId;
    });
  };

  // 같은 챕터끼리만 순서를 바꾼다 — 실제 서술 순서(parentId 체인)는 안 건드리고, 그 챕터를 볼 때 표시되는 순서(project.story 배열 순서)만 서로 인접한
  // 같은 챕터 지점끼리 자리를 맞바꿔 조정한다. "전체 스토리"는 여전히 원래 쓰여진 순서 그대로 보임
  const moveNode = (id: string, direction: "up" | "down") => {
    pushUndo();
    update((p) => {
      const node = p.story.find((n) => n.id === id);
      if (!node) return;
      const sameChapter = p.story.filter((n) => n.chapterId === node.chapterId);
      const posInChapter = sameChapter.findIndex((n) => n.id === id);
      const neighbor = direction === "up" ? sameChapter[posInChapter - 1] : sameChapter[posInChapter + 1];
      if (!neighbor) return;
      const i = p.story.findIndex((n) => n.id === id);
      const j = p.story.findIndex((n) => n.id === neighbor.id);
      [p.story[i], p.story[j]] = [p.story[j], p.story[i]];
    });
  };

  // 선택한 구간을 새 떡밥으로 표시 — 번호는 삭제돼도 재사용 안 하도록 항상 지금까지의 최댓값+1
  const plantForeshadow = (nodeId: string, start: number, end: number, text: string) => {
    if (start === end) return;
    pushUndo();
    update((p) => {
      const number = Math.max(0, ...p.foreshadows.map((f) => f.number)) + 1;
      p.foreshadows.push({ id: uid(), number, plantNodeId: nodeId, plantStart: start, plantEnd: end, plantText: text });
    });
  };

  // 선택한 구간을 기존 떡밥의 회수 지점으로 표시
  const resolveForeshadow = (foreshadowId: string, nodeId: string, start: number, end: number, text: string) => {
    if (start === end) return;
    pushUndo();
    update((p) => {
      const f = p.foreshadows.find((x) => x.id === foreshadowId);
      if (f) Object.assign(f, { resolveNodeId: nodeId, resolveStart: start, resolveEnd: end, resolveText: text });
    });
  };

  // 떡밥 자체(설정+회수 전체)를 삭제
  const deleteForeshadow = (foreshadowId: string) => {
    pushUndo();
    update((p) => void (p.foreshadows = p.foreshadows.filter((f) => f.id !== foreshadowId)));
  };

  // 회수 표시만 취소하고 설정은 남겨둠(다시 미회수 상태로)
  const unresolveForeshadow = (foreshadowId: string) => {
    pushUndo();
    update((p) => {
      const f = p.foreshadows.find((x) => x.id === foreshadowId);
      if (f) Object.assign(f, { resolveNodeId: undefined, resolveStart: undefined, resolveEnd: undefined, resolveText: undefined });
    });
  };

  // AI에게 넘길 "지금까지의 이야기"는 챕터 선택과 무관하게 항상 전체 흐름(활성 경로)을 써야 맥락이 끊기지 않는다
  const activePath = storyActivePath(project.story, project.storyCurrentId);
  const isUnassignedSelected = selectedChapterId === UNASSIGNED_CHAPTER;
  const selectedChapterPath = chapterPath(project.chapters, isUnassignedSelected ? null : selectedChapterId);
  const selectedChapter = isUnassignedSelected ? undefined : project.chapters.find((c) => c.id === selectedChapterId);
  // 지점 수 집계는 activePath(지금 이어 쓰고 있는 한 줄기)만 기준으로 삼는다 — project.story 전체(지난 세션에 branch 전환 기능이
  // 있던 시절 남은 가지 등)를 기준으로 세면 "전체 스토리" 수(활성 경로 기준)와 챕터별 합이 안 맞을 수 있어서,
  // "전체 = 챕터들의 합 + 미분류"가 항상 정확히 맞아떨어지도록 소속 판정은 activePath로 통일함.
  // 다만 챕터/미분류 화면의 표시 "순서"는 activePath(parentId 체인 순서, 고정)가 아니라 project.story 배열 순서를 따라야
  // moveNode()로 같은 챕터 안에서 순서를 바꾼 게 실제로 보임 — 그래서 멤버십만 activePath로 걸러내고 순서는 배열 그대로 둔다
  const activePathIds = new Set(activePath.map((n) => n.id));
  const displayedNodes = isUnassignedSelected
    ? project.story.filter((n) => activePathIds.has(n.id) && !n.chapterId)
    : selectedChapterId
      ? project.story.filter((n) => activePathIds.has(n.id) && n.chapterId === selectedChapterId)
      : activePath;
  const unassignedCount = activePath.filter((n) => !n.chapterId).length;
  // 지금 화면에 보이는 지점과 관련된(설정 또는 회수 지점이 그 안에 있는) 떡밥만 각주로 보여준다
  const displayedNodeIds = new Set(displayedNodes.map((n) => n.id));
  const footnoteForeshadows = project.foreshadows
    .filter((f) => displayedNodeIds.has(f.plantNodeId) || (f.resolveNodeId && displayedNodeIds.has(f.resolveNodeId)))
    .sort((a, b) => a.number - b.number);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedNodes.length, loading]);

  const payload = () => ({
    genre: project.genre,
    world: project.world,
    personas: project.personas.filter((p) => !p.deleted),
    groups: project.groups.filter((g) => !g.deleted),
    personaRelations: project.personaRelations,
    groupRelations: project.groupRelations,
    personaGroupRelations: project.personaGroupRelations,
    facts: project.facts,
    foreshadows: project.foreshadows,
    chapters: project.chapters,
    // 지금 이어 쓰면 새 내용이 태그될 챕터와 동일한 기준(write()의 chapterId 계산과 맞춰야 캐릭터 등장 챕터 판정이 어긋나지 않음)
    currentChapterId: selectedChapterId && selectedChapterId !== UNASSIGNED_CHAPTER ? selectedChapterId : null,
    storySoFar: activePath.map((s) => s.text).join("\n\n"),
    model: model || undefined,
    llm,
    viewpoint: project.viewpoint,
  });

  const suggest = async () => {
    if (loading) return;
    setError("");
    setOptions([]);
    setLoading("suggest");
    try {
      const data = await postAI("/api/story", { mode: "suggest", ...payload() });
      setOptions(data.options ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  // 방금 새로 추가된 내용(direction+story)이 세계관·사실·캐릭터·집단·관계 설정과 충돌하는지 자동으로 검사.
  // 검사 실패는 이야기 쓰기 자체를 막지 않도록 조용히 무시한다 — 부가 기능이지 핵심 기능이 아님
  const checkConsistency = async (newText: string) => {
    setChecking(true);
    setConflicts([]);
    try {
      const data = await postAI("/api/story", { mode: "check", ...payload(), newText });
      setConflicts(data.issues ?? []);
    } catch {
      // 무시
    } finally {
      setChecking(false);
    }
  };

  // 방금 새로 추가된 내용에서 기존 설정에 없던 사실·인물·집단을 뽑아 승인 대기(project.pending)에 올린다.
  // 승인 전까지는 공식 설정에 영향 없음(PendingTab에서 검토 후 승인). checkConsistency와 같은 정책으로 실패는 조용히 무시.
  // ponytail: 같은 항목이 승인되기 전에 또 write하면 중복으로 쌓일 수 있음 — 승인 큐가 자주 지저분해지면 그때 중복 제거 추가할 것
  const extractEntities = async (newText: string) => {
    try {
      const data = await postAI("/api/story", { mode: "extract", ...payload(), newText });
      update((p) => {
        for (const content of data.facts ?? []) p.pending.push({ id: uid(), kind: "fact", content });
        for (const per of data.personas ?? []) p.pending.push({ id: uid(), kind: "persona", name: per.name, summary: per.summary });
        for (const g of data.groups ?? []) p.pending.push({ id: uid(), kind: "group", name: g.name, summary: g.summary });
      });
    } catch {
      // 무시
    }
  };

  // 항상 storyCurrentId(현재 이어 쓰고 있는 지점) 아래에 새 가지를 붙인다 — 다른 노드를 먼저 골라두면 그 지점에서 새로 갈라짐
  const write = async (dir: string) => {
    const text = dir.trim();
    if (!text || loading) return;
    pushUndo(); // 되돌리기: 이 "이어서 쓰기" 전체(방향+본문)를 한 번에 되돌릴 수 있도록 시작 전 상태를 남긴다
    setError("");
    setOptions([]);
    setConflicts([]);
    setLoading("write");
    const directionId = uid();
    // 챕터를 선택해둔 상태에서 이어 쓰면 새로 추가되는 내용도 그 챕터로 자동 태그된다 ("미분류" 선택 중엔 그대로 미분류로 남음)
    const chapterId = selectedChapterId && selectedChapterId !== UNASSIGNED_CHAPTER ? selectedChapterId : undefined;
    update((p) => {
      p.story.push({ id: directionId, parentId: p.storyCurrentId, role: "direction", text, chapterId, at: new Date().toISOString() });
      p.storyCurrentId = directionId;
    });
    try {
      const data = await postAI("/api/story", { mode: "write", ...payload(), direction: text });
      update((p) => {
        const storyId = uid();
        p.story.push({ id: storyId, parentId: directionId, role: "story", text: data.text, chapterId, at: new Date().toISOString() });
        p.storyCurrentId = storyId;
      });
      setDirection("");
      checkConsistency(`${text}\n\n${data.text}`); // 실시간 설정 충돌 검사 — 완료를 기다리지 않고 백그라운드로 진행
      extractEntities(`${text}\n\n${data.text}`); // 새 사실·인물·집단 추출 — 역시 백그라운드로, 승인함 탭에 쌓인다
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:h-full sm:flex-row">
      <ChapterTree project={project} update={update} selectedChapterId={selectedChapterId} onSelect={setSelectedChapterId} />
      <div className="flex min-w-0 flex-1 flex-col sm:h-full">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="shrink-0 text-sm font-semibold">이야기 쓰기</h2>
            <span
              title="왼쪽 챕터 구성에서 챕터를 클릭하면 그 챕터의 내용만 보이고, 이어 쓰는 내용도 그 챕터로 태그됩니다. 다시 클릭하면 전체 이야기로 돌아옵니다"
              className={`truncate rounded-full px-2 py-0.5 text-xs font-medium ${
                selectedChapterPath.length || isUnassignedSelected
                  ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
              }`}
            >
              {isUnassignedSelected
                ? "미분류"
                : selectedChapterPath.length
                  ? selectedChapterPath.map((c) => c.title).join(" › ")
                  : "전체 이야기"}
            </span>
            <select
              value={project.viewpoint.mode}
              onChange={(e) => setViewpointMode(e.target.value as ViewpointMode)}
              title="이야기 쓰기의 서술 시점을 고릅니다"
              className="rounded border px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            >
              {(Object.entries(VIEWPOINT_LABEL) as [ViewpointMode, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {VIEWPOINT_NEEDS_NARRATOR(project.viewpoint.mode) && (
              <select
                value={project.viewpoint.narratorPersonaId ?? ""}
                onChange={(e) => setNarrator(e.target.value)}
                title="이 시점의 서술자('나')로 삼을 캐릭터를 고릅니다"
                className={`rounded border px-2 py-1 text-xs dark:bg-gray-900 ${
                  project.viewpoint.narratorPersonaId ? "dark:border-gray-700" : "border-orange-400 text-orange-600 dark:border-orange-500 dark:text-orange-400"
                }`}
              >
                <option value="">서술자를 고르세요</option>
                {project.personas
                  .filter((p) => !p.deleted)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={suggest}
            disabled={!!loading}
            className="whitespace-nowrap rounded border px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-gray-900"
          >
            {loading === "suggest" ? "생각하는 중…" : "다음 상황 제안받기"}
          </button>
        </div>
      </div>

      {/* 챕터별 시점 재정의 — 특정 챕터를 선택 중일 때만 뜨고, "기본값 사용"이면 위 프로젝트 기본 시점을 그대로 따름 */}
      {selectedChapter && (
        <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2 text-xs text-gray-400">
          <span>&quot;{selectedChapter.title}&quot;만 다른 시점:</span>
          <select
            value={selectedChapter.viewpoint?.mode ?? ""}
            onChange={(e) => setChapterViewpointMode(selectedChapter.id, e.target.value as ViewpointMode | "")}
            title="이 챕터(와 하위 챕터)에서만 다른 서술 시점을 씁니다. 지정하지 않으면 프로젝트 기본 시점을 따릅니다"
            className="rounded border px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">기본값 사용</option>
            {(Object.entries(VIEWPOINT_LABEL) as [ViewpointMode, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {selectedChapter.viewpoint && VIEWPOINT_NEEDS_NARRATOR(selectedChapter.viewpoint.mode) && (
            <select
              value={selectedChapter.viewpoint.narratorPersonaId ?? ""}
              onChange={(e) => setChapterNarrator(selectedChapter.id, e.target.value)}
              title="이 챕터 시점의 서술자('나')로 삼을 캐릭터를 고릅니다"
              className={`rounded border px-2 py-1 text-xs dark:bg-gray-900 ${
                selectedChapter.viewpoint.narratorPersonaId
                  ? "dark:border-gray-700"
                  : "border-orange-400 text-orange-600 dark:border-orange-500 dark:text-orange-400"
              }`}
            >
              <option value="">서술자를 고르세요</option>
              {project.personas
                .filter((p) => !p.deleted)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}

      {/* 챕터 카드 — 왼쪽 챕터 구성 트리와 같은 selectedChapterId를 클릭 한 번으로 전환. 풀 스토리 카드는 항상 전체 이야기(필터 해제)로 이동 */}
      <div className="mt-2 flex shrink-0 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedChapterId(null)}
          title="전체 이야기를 순서대로 봅니다 (챕터에 안 속한 내용도 포함된 전체 지점 수)"
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
            selectedChapterId === null
              ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
              : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          }`}
        >
          <div className="font-semibold">전체 스토리</div>
          <div className="text-[10px] text-gray-400">{activePath.length}개 지점</div>
        </button>
        {chapterTreeOrder(project.chapters).map(({ chapter, depth }) => {
          const count = activePath.filter((n) => n.chapterId === chapter.id).length;
          return (
            <button
              key={chapter.id}
              onClick={() => setSelectedChapterId(selectedChapterId === chapter.id ? null : chapter.id)}
              title="클릭하면 이 챕터의 내용만 보고 씁니다. 다시 클릭하면 전체 스토리로 돌아갑니다"
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                selectedChapterId === chapter.id
                  ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
                  : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
              }`}
            >
              <div className="font-semibold">
                {"　".repeat(depth)}
                {chapter.title}
              </div>
              <div className="text-[10px] text-gray-400">{count}개 지점</div>
            </button>
          );
        })}
        {unassignedCount > 0 && (
          <button
            onClick={() => setSelectedChapterId(isUnassignedSelected ? null : UNASSIGNED_CHAPTER)}
            title="어느 챕터에도 태그되지 않은 지점만 봅니다 — 전체 스토리 지점 수가 챕터별 합과 안 맞을 때 여기서 확인하세요"
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
              isUnassignedSelected
                ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
                : "border-dashed border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-900"
            }`}
          >
            <div className="font-semibold">미분류</div>
            <div className="text-[10px] text-gray-400">{unassignedCount}개 지점</div>
          </button>
        )}
      </div>

      <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="가장 최근의 '이어서 쓰기' 또는 직접 수정을 한 단계 되돌립니다"
          className="whitespace-nowrap rounded border px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-gray-900"
        >
          ↩ 되돌리기 ({undoStack.length})
        </button>
        <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-400">
          최대
          <input
            type="number"
            min={1}
            max={100}
            value={maxUndo}
            onChange={(e) => setMaxUndoClamped(+e.target.value)}
            title="최대로 되돌릴 수 있는 횟수"
            className="w-12 rounded border px-1 py-0.5 text-xs"
          />
          회
        </label>
      </div>

      <div className="mt-2 space-y-3 rounded border p-3 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
        {displayedNodes.length === 0 && (
          <p className="text-sm text-gray-400">
            {isUnassignedSelected
              ? "어느 챕터에도 태그되지 않은 지점이 없습니다."
              : selectedChapterId
                ? "이 챕터에 태그된 내용이 아직 없습니다. 아래에서 이어서 쓰면 이 챕터로 기록됩니다."
                : "세계관·캐릭터·집단·관계·사실 설정 전체를 바탕으로 다음 전개를 제안받거나, 아래에 직접 방향을 입력해 이야기를 소설체로 이어 쓸 수 있습니다."}
          </p>
        )}
        {displayedNodes.map((s, idx) => (
          <EditableStoryNode
            key={s.id}
            node={s}
            onFocus={pushUndo}
            onChange={(text) =>
              update((p) => {
                const n = p.story.find((x) => x.id === s.id);
                if (n) n.text = text;
              })
            }
            onDelete={() => deleteNode(s.id)}
            onAssignChapter={isUnassignedSelected ? (chapterId) => assignChapter(s.id, chapterId) : undefined}
            chapters={project.chapters}
            onMoveUp={!isUnassignedSelected && selectedChapterId && idx > 0 ? () => moveNode(s.id, "up") : undefined}
            onMoveDown={
              !isUnassignedSelected && selectedChapterId && idx < displayedNodes.length - 1 ? () => moveNode(s.id, "down") : undefined
            }
            foreshadows={project.foreshadows}
            onPlantForeshadow={(start, end, text) => plantForeshadow(s.id, start, end, text)}
            onResolveForeshadow={(foreshadowId, start, end, text) => resolveForeshadow(foreshadowId, s.id, start, end, text)}
            onDeleteForeshadow={deleteForeshadow}
            onUnresolveForeshadow={unresolveForeshadow}
            highlighted={s.id === highlightNodeId}
          />
        ))}
        {loading === "write" && <p className="text-sm text-gray-400">이야기를 쓰는 중…</p>}
        <div ref={bottomRef} />
      </div>

      {/* 떡밥 각주 — 지금 보이는 지점과 관련된 떡밥만 책 각주처럼 나열, 클릭하면 해당 본문으로 스크롤+강조 */}
      {footnoteForeshadows.length > 0 && (
        <div className="mt-1 max-h-10 shrink-0 space-y-0.5 overflow-y-auto border-t border-gray-200 pt-1 text-[11px] text-gray-400 dark:border-gray-800">
          {footnoteForeshadows.map((f) => (
            <div key={f.id} className="truncate">
              <button
                onClick={() => scrollToNode(f.plantNodeId)}
                title={`"${f.plantText}" 지점으로 이동`}
                className="hover:underline hover:text-amber-600 dark:hover:text-amber-400"
              >
                떡밥{f.number}: &quot;{f.plantText}&quot;
              </button>
              {f.resolveNodeId && f.resolveText && (
                <>
                  {" → "}
                  <button
                    onClick={() => scrollToNode(f.resolveNodeId!)}
                    title={`"${f.resolveText}" 지점으로 이동`}
                    className="hover:underline hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    &quot;{f.resolveText}&quot; 회수
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {checking && <p className="mt-1 shrink-0 text-xs text-gray-400">설정 충돌 검사 중…</p>}
      {conflicts.length > 0 && (
        <div className="mt-1 shrink-0 space-y-1 rounded border border-orange-400 bg-orange-50 p-2 dark:border-orange-500/50 dark:bg-orange-950/30">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">⚠ 설정과 충돌할 수 있는 부분</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {conflicts.map((c, i) => (
              <li key={i} className="text-xs text-orange-700 dark:text-orange-300">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-1 shrink-0 whitespace-pre-wrap text-xs text-red-500">오류: {error}</p>}

      {options.length > 0 && (
        <div className="mt-2 flex shrink-0 flex-wrap gap-1.5">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => write(opt)}
              disabled={!!loading}
              title={opt}
              className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-gray-900"
            >
              {opt.length > 28 ? `${opt.slice(0, 28)}…` : opt}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex shrink-0 gap-2">
        <input
          className="flex-1 rounded border px-3 py-1.5 text-sm"
          placeholder="원하는 전개를 직접 입력해 이어서 쓰기"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && write(direction)}
        />
        <button
          onClick={() => write(direction)}
          disabled={!!loading || !direction.trim()}
          className="shrink-0 whitespace-nowrap rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          이어서 쓰기
        </button>
      </div>
      </div>
    </div>
  );
}

// 떡밥 구간의 저장된 start/end가 이후 텍스트 편집으로 밀려났을 수 있으니, 우선 그 위치를 그대로 믿어보고
// 스니펫이 더 이상 안 맞으면 지금 텍스트에서 스니펫을 다시 찾아 위치를 보정한다(기존 배지 표시와 같은 방식)
function locateForeshadowRange(text: string, start: number, end: number, snippet: string): { start: number; end: number } | null {
  if (!snippet) return null;
  if (text.slice(start, end) === snippet) return { start, end };
  const idx = text.indexOf(snippet);
  return idx === -1 ? null : { start: idx, end: idx + snippet.length };
}

// 형광펜 오버레이용: 떡밥 설정/회수 구간을 <mark>로 감싸 렌더링(겹치는 구간은 먼저 온 것만 반영)
function renderForeshadowHighlights(text: string, plantedHere: Foreshadow[], resolvedHere: Foreshadow[]) {
  const ranges = [
    ...plantedHere.map((f) => ({ range: locateForeshadowRange(text, f.plantStart, f.plantEnd, f.plantText), kind: "plant" as const })),
    ...resolvedHere.map((f) => ({
      range:
        f.resolveStart != null && f.resolveEnd != null && f.resolveText
          ? locateForeshadowRange(text, f.resolveStart, f.resolveEnd, f.resolveText)
          : null,
      kind: "resolve" as const,
    })),
  ]
    .filter((r): r is { range: { start: number; end: number }; kind: "plant" | "resolve" } => r.range !== null)
    .sort((a, b) => a.range.start - b.range.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const { range, kind } of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark
        key={`${kind}-${range.start}`}
        className={kind === "plant" ? "rounded-[2px] bg-amber-300/70 dark:bg-amber-500/40" : "rounded-[2px] bg-emerald-300/70 dark:bg-emerald-500/40"}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// 이야기 로그의 한 지점(direction 또는 story)을 직접 고쳐 쓸 수 있는 자동 높이조절 textarea.
// direction은 앞에 "▶" 표시만 붙이고 그 표시는 편집 대상에서 뺀다(실수로 지우지 못하게)
function EditableStoryNode({
  node,
  onChange,
  onFocus,
  onDelete,
  onAssignChapter,
  chapters,
  onMoveUp,
  onMoveDown,
  foreshadows,
  onPlantForeshadow,
  onResolveForeshadow,
  onDeleteForeshadow,
  onUnresolveForeshadow,
  highlighted,
}: {
  node: StoryNode;
  onChange: (text: string) => void;
  onFocus?: () => void;
  onDelete: () => void;
  onAssignChapter?: (chapterId: string) => void;
  chapters: Chapter[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  foreshadows: Foreshadow[];
  onPlantForeshadow: (start: number, end: number, text: string) => void;
  onResolveForeshadow: (foreshadowId: string, start: number, end: number, text: string) => void;
  onDeleteForeshadow: (foreshadowId: string) => void;
  onUnresolveForeshadow: (foreshadowId: string) => void;
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // "떡밥 설정/회수" 버튼·셀렉트를 누르는 순간엔 이미 textarea가 blur된 뒤라 selectionStart/End를 다시 읽는 게
  // 브라우저마다(특히 blur 이후 선택 값 유지 여부가 갈릴 수 있어) 불안정할 수 있음 — 그래서 선택이 "일어나는 바로 그 순간"
  // onSelect에서 값을 미리 붙잡아두고, 나중엔 이 저장된 값만 사용한다(다시 읽지 않음)
  const lastSelectionRef = useRef<{ start: number; end: number } | null>(null);
  // 본문을 드래그로 선택하면 그 위에 뜨는 떡밥 설정/회수 메뉴 표시 여부. 메뉴 버튼엔 onMouseDown에서 preventDefault를 걸어
  // 클릭해도 textarea가 blur되지 않게 해뒀으므로(선택도 그대로 유지됨), 진짜 다른 곳을 클릭했을 때만 onBlur로 닫힌다
  const [hasSelection, setHasSelection] = useState(false);
  const isDirection = node.role === "direction";
  const plantedHere = foreshadows.filter((f) => f.plantNodeId === node.id);
  const resolvedHere = foreshadows.filter((f) => f.resolveNodeId === node.id);
  const unresolved = foreshadows.filter((f) => !f.resolveNodeId);

  const withSelection = (fn: (start: number, end: number, text: string) => void) => {
    const sel = lastSelectionRef.current;
    if (!sel || sel.start === sel.end) {
      alert("떡밥으로 표시할 단어나 문구를 먼저 선택하세요.");
      return;
    }
    fn(sel.start, sel.end, node.text.slice(sel.start, sel.end));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recalc = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    recalc();
    // 마운트 시점엔 주변 flex 레이아웃(챕터 카드 줄, 관계도/이야기 쓰기 비율 등)이 아직 최종 너비로 자리잡기 전이라
    // scrollHeight를 실제보다 훨씬 크게(좁은 너비 기준으로) 잘못 측정하는 경우가 있음 — 부모 요소의 크기가 실제로
    // 바뀔 때마다(레이아웃이 뒤늦게 자리잡을 때 포함) 다시 재보도록 ResizeObserver로 감시(텍스트 자체가 아니라
    // 부모의 너비 변화를 관찰하므로 자기 자신의 높이 변경으로 인한 무한 루프 걱정 없음)
    const parent = el.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(recalc);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [node.text]);

  return (
    <div
      data-story-node-id={node.id}
      className={`group flex items-start gap-1 rounded transition-shadow ${highlighted ? "ring-2 ring-amber-400 dark:ring-amber-500" : ""}`}
    >
      {isDirection && <span className="mt-0.5 shrink-0 text-sm font-semibold text-fuchsia-600 dark:text-fuchsia-400">▶</span>}
      <div className="min-w-0 flex-1">
        {/* 형광펜 효과: textarea 글자는 투명하게 만들고, 뒤에 같은 텍스트를 그린 div에서 떡밥 구간만 <mark>로 칠해 비쳐 보이게 함
            (plain textarea라 글자에 직접 서식을 입힐 수 없어서 쓰는 우회 — 같은 grid 칸에 겹쳐 폭/줄바꿈이 항상 일치) */}
        <div className="relative grid">
          <div
            aria-hidden
            className={`col-start-1 row-start-1 w-full whitespace-pre-wrap break-words rounded p-0.5 leading-relaxed ${
              isDirection ? "text-sm font-semibold text-fuchsia-600 dark:text-fuchsia-400" : "text-sm"
            }`}
          >
            {renderForeshadowHighlights(node.text, plantedHere, resolvedHere)}
          </div>
          <textarea
            ref={ref}
            rows={1}
            value={node.text}
            onFocus={onFocus}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) => {
              const { selectionStart, selectionEnd } = e.currentTarget;
              if (selectionStart !== selectionEnd) lastSelectionRef.current = { start: selectionStart, end: selectionEnd };
              setHasSelection(selectionStart !== selectionEnd);
            }}
            onBlur={() => setHasSelection(false)}
            className={`col-start-1 row-start-1 w-full resize-none overflow-hidden rounded bg-transparent p-0.5 leading-relaxed text-transparent caret-gray-900 focus:outline-none focus:ring-1 focus:ring-fuchsia-300 dark:caret-gray-100 dark:focus:ring-fuchsia-700 ${
              isDirection ? "text-sm font-semibold" : "text-sm"
            }`}
          />
          {hasSelection && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute -top-8 right-0 z-10 flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[10px] shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              <button
                onClick={() => {
                  withSelection((start, end, text) => onPlantForeshadow(start, end, text));
                  setHasSelection(false);
                }}
                title="선택한 문구를 새 떡밥(복선)으로 표시합니다"
                className="rounded px-1.5 py-0.5 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
              >
                떡밥 설정
              </button>
              {unresolved.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const foreshadowId = e.target.value;
                    if (!foreshadowId) return;
                    withSelection((start, end, text) => onResolveForeshadow(foreshadowId, start, end, text));
                    setHasSelection(false);
                  }}
                  title="선택한 문구를 기존 떡밥의 회수 지점으로 표시합니다"
                  className="rounded border-0 bg-transparent px-1 py-0.5 text-emerald-600 dark:text-emerald-400"
                >
                  <option value="">떡밥 회수</option>
                  {unresolved.map((f) => (
                    <option key={f.id} value={f.id}>
                      떡밥{f.number} 회수
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
        {(plantedHere.length > 0 || resolvedHere.length > 0) && (
          <div className="flex flex-wrap gap-1 px-0.5">
            {plantedHere.map((f) => (
              <span
                key={`plant-${f.id}`}
                title={`"${f.plantText}"`}
                className="flex items-center gap-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >
                떡밥{f.number} 설정
                <button
                  onClick={() => onDeleteForeshadow(f.id)}
                  title="이 떡밥 전체(설정+회수) 삭제"
                  className="text-amber-500 hover:text-red-600 dark:text-amber-400 dark:hover:text-red-400"
                >
                  ✕
                </button>
              </span>
            ))}
            {resolvedHere.map((f) => (
              <span
                key={`resolve-${f.id}`}
                title={`"${f.resolveText}"`}
                className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              >
                떡밥{f.number} 회수
                <button
                  onClick={() => onUnresolveForeshadow(f.id)}
                  title="회수 표시만 취소 (설정은 남김)"
                  className="text-emerald-500 hover:text-red-600 dark:text-emerald-400 dark:hover:text-red-400"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      {(onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col opacity-0 group-hover:opacity-100">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            title="같은 챕터 안에서 위로 옮기기"
            className="rounded px-1 text-[10px] leading-none text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-500 dark:hover:bg-gray-800"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            title="같은 챕터 안에서 아래로 옮기기"
            className="rounded px-1 text-[10px] leading-none text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-500 dark:hover:bg-gray-800"
          >
            ▼
          </button>
        </div>
      )}
      {onAssignChapter && chapters.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onAssignChapter(e.target.value)}
          title="이 지점을 챕터로 이동합니다"
          className="mt-0.5 shrink-0 rounded border px-1 py-0.5 text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 dark:border-gray-700 dark:text-gray-500"
        >
          <option value="">챕터로 이동</option>
          {chapterTreeOrder(chapters).map(({ chapter, depth }) => (
            <option key={chapter.id} value={chapter.id}>
              {"　".repeat(depth)}
              {chapter.title}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={onDelete}
        title="이 부분 삭제 (되돌리기로 복구 가능)"
        className="mt-0.5 shrink-0 rounded px-1 text-xs text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-red-950/40"
      >
        ✕
      </button>
    </div>
  );
}

function ChapterTree({
  project,
  update,
  selectedChapterId,
  onSelect,
}: TabProps & { selectedChapterId: string | null; onSelect: (id: string | null) => void }) {
  const tree = chapterTreeOrder(project.chapters);
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");

  const childCount = (id: string) => project.chapters.filter((c) => c.parentId === id).length;

  const add = () => {
    if (!title.trim()) return;
    update((p) => {
      p.chapters.push({ id: uid(), parentId: parentId || null, title: title.trim() });
    });
    setTitle("");
    setParentId("");
  };

  // 다시 누르면 선택 해제(전체 이야기로 돌아감), 다른 챕터를 누르면 그쪽으로 전환
  const select = (chapterId: string) => onSelect(selectedChapterId === chapterId ? null : chapterId);

  const remove = (chapterId: string) => {
    update((p) => {
      p.chapters = p.chapters.filter((c) => c.id !== chapterId);
      for (const n of p.story) if (n.chapterId === chapterId) delete n.chapterId;
    });
    if (selectedChapterId === chapterId) onSelect(null);
  };

  return (
    <div className="flex max-h-40 w-full shrink-0 flex-col border-b border-gray-200 pb-3 sm:h-full sm:max-h-none sm:w-44 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3 dark:border-gray-800">
      <span className="text-xs font-semibold text-gray-500">챕터 구성</span>
      <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {tree.length === 0 && <p className="text-[11px] text-gray-400">막·장을 추가해 이야기를 정리하세요.</p>}
        {tree.map(({ chapter, depth }) => (
          <div key={chapter.id} className="group flex items-center gap-1" style={{ paddingLeft: depth * 10 }}>
            <button
              onClick={() => select(chapter.id)}
              title="클릭하면 이 챕터의 내용만 보고 쓸 수 있습니다. 다시 클릭하면 전체 이야기로 돌아갑니다"
              className={`flex-1 truncate rounded px-1 py-0.5 text-left text-[11px] ${
                chapter.id === selectedChapterId
                  ? "bg-fuchsia-100 font-semibold text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
              }`}
            >
              {chapter.title}
            </button>
            {childCount(chapter.id) === 0 && (
              <button
                onClick={() => remove(chapter.id)}
                className="hidden shrink-0 text-gray-300 hover:text-red-500 group-hover:inline"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 shrink-0 space-y-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
          placeholder="새 챕터 (예: 1막, 2장)"
          className="w-full rounded border px-1.5 py-1 text-[11px]"
        />
        {project.chapters.length > 0 && (
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full rounded border px-1.5 py-1 text-[11px]">
            <option value="">최상위(막)로 추가</option>
            {tree.map(({ chapter, depth }) => (
              <option key={chapter.id} value={chapter.id}>{"　".repeat(depth) + chapter.title}</option>
            ))}
          </select>
        )}
        <button onClick={add} className="w-full rounded border px-1.5 py-1 text-[11px] hover:bg-gray-50 dark:hover:bg-gray-900">
          추가
        </button>
      </div>
    </div>
  );
}

function MsgView({
  m,
  name,
  image,
  imagePosition,
}: {
  m: Msg;
  name: string;
  image?: string;
  imagePosition?: { x: number; y: number };
}) {
  if (m.role === "author")
    return (
      <div className="text-right">
        <span className="inline-block max-w-[80%] rounded-lg bg-black px-3 py-2 text-left text-sm text-white dark:bg-white dark:text-black">
          {m.text}
        </span>
      </div>
    );
  return (
    <div className="flex gap-2">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={name}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          style={{ objectPosition: `${imagePosition?.x ?? 50}% ${imagePosition?.y ?? 50}%` }}
        />
      ) : null}
      <div>
        <div className="text-xs font-semibold text-gray-500">{name}</div>
        <div className="mt-0.5 inline-block max-w-full rounded-lg bg-gray-100 px-3 py-2 text-sm whitespace-pre-wrap dark:bg-gray-800">
          {m.text}
        </div>
        {m.inner && (
          <div className="mt-1 text-xs text-gray-400">
            <span>속마음</span>
            <p className="mt-1 whitespace-pre-wrap italic">{m.inner}</p>
          </div>
        )}
      </div>
    </div>
  );
}

type AiLogEntry = { id: string; at: string | null; kind: "story" | "interview"; label: string; detail: string };

// 이야기 이어쓰기(direction→story)와 인터뷰(author↔char) 기록을 한 줄씩으로 뽑아 시간순으로 합친다.
// story는 moveNode로 표시 순서(배열 순서)만 바뀔 수 있어 배열 순서를 믿을 수 없으므로, at(생성 시각)로 정렬한다.
// at이 없는(이 필드가 생기기 전) 기록은 "" 취급 — 맨 앞(가장 오래된 것)으로 몰린다.
function buildAiLog(project: Project): AiLogEntry[] {
  const entries: AiLogEntry[] = [];

  for (const node of project.story) {
    if (node.role !== "story") continue; // story 노드 기준으로 direction+story를 한 항목으로 합침
    const direction = project.story.find((n) => n.id === node.parentId);
    entries.push({
      id: node.id,
      at: node.at ?? null,
      kind: "story",
      label: direction ? `방향: ${direction.text}` : "이어쓰기",
      detail: node.text,
    });
  }

  for (const persona of project.personas) {
    const chat = project.chats[persona.id] ?? [];
    chat.forEach((m, i) => {
      if (m.role !== "author") return;
      const reply = chat[i + 1]?.role === "char" ? chat[i + 1] : null;
      entries.push({
        id: `${persona.id}-${i}`,
        at: m.at ?? null,
        kind: "interview",
        label: `인터뷰 · ${persona.name}`,
        detail: reply ? `Q. ${m.text}\nA. ${reply.text}` : `Q. ${m.text}`,
      });
    });
  }

  return entries.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

// 이야기를 쓰거나 인터뷰를 할 때마다 AI가 만든 내용을 시간순으로 모아 보여준다 — 지어낸 지명·인물·사건을
// 나중에 세계관/사실/캐릭터 등에 반영할지 사람이 훑어볼 수 있게 하는 용도(자동 반영은 아직 안 함).
function AiLogTab({ project }: { project: Project }) {
  const entries = buildAiLog(project);
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">아직 기록이 없습니다. 이야기를 이어 쓰거나 인터뷰를 하면 여기에 시간순으로 남습니다.</p>;
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-gray-500">
        이야기 이어쓰기와 인터뷰에서 AI가 만든 내용을 시간순으로 모았습니다. 새로 나온 지명·인물·사건이 있으면 여기서 확인하고
        해당 탭(사실·비밀/캐릭터/집단/관계 등)에 직접 옮겨 적으세요.
      </p>
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id} className="rounded border border-gray-200 p-2.5 dark:border-gray-800">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-gray-400">
              <span className={e.kind === "story" ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-sky-600 dark:text-sky-400"}>
                {e.kind === "story" ? "📖" : "💬"} {e.label}
              </span>
              <span>{e.at ? formatDateTime(e.at) : "시간 미상"}</span>
            </div>
            <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{e.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// kind별로 승인 시 어디로 들어가는지, 목록에 어떻게 보여줄지 한곳에 모음 — lib/store.ts의 Pending 타입 주석 참고
function pendingLabel(item: Pending, nameOf: (personaId: string) => string): { tag: string; text: string } {
  switch (item.kind) {
    case "personaNote":
      return { tag: nameOf(item.personaId), text: item.text };
    case "fact":
      return { tag: "새 사실·비밀", text: item.content };
    case "persona":
      return { tag: "새 캐릭터", text: `${item.name} — ${item.summary}` };
    case "group":
      return { tag: "새 집단", text: `${item.name} — ${item.summary}` };
  }
}

function applyPending(p: Project, item: Pending) {
  switch (item.kind) {
    case "personaNote":
      p.personas.find((x) => x.id === item.personaId)?.notes.push(item.text);
      break;
    case "fact":
      p.facts.push({ id: uid(), content: item.content, access: {} });
      break;
    case "persona":
      p.personas.push({ ...newPersona(item.name), notes: [item.summary] });
      break;
    case "group":
      p.groups.push({ ...newGroup(item.name), description: item.summary });
      break;
  }
}

function PendingTab({ project, update }: TabProps) {
  if (project.pending.length === 0)
    return (
      <p className="text-sm text-gray-500">
        승인 대기 중인 설정이 없습니다. 인터뷰 중 나온 즉흥 설정이나, 이야기를 이어 쓰면서 새로 나온 사실·인물·집단이 여기에 모입니다.
      </p>
    );
  const nameOf = (id: string) => project.personas.find((p) => p.id === id)?.name ?? "?";
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">승인한 항목만 실제 설정(캐릭터 메모/사실/캐릭터/집단)에 반영됩니다.</p>
      {project.pending.map((item) => {
        const { tag, text } = pendingLabel(item, nameOf);
        return (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded border p-3 text-sm">
            <div>
              <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">{tag}</span>
              {text}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() =>
                  update((p) => {
                    applyPending(p, item);
                    p.pending = p.pending.filter((x) => x.id !== item.id);
                  })
                }
                className="rounded bg-green-600 px-3 py-1 text-white"
              >
                승인
              </button>
              <button
                onClick={() => update((p) => void (p.pending = p.pending.filter((x) => x.id !== item.id)))}
                className="rounded border px-3 py-1"
              >
                거절
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrashTab({ project, update }: TabProps) {
  const deletedPersonas = project.personas.filter((p) => p.deleted);
  const deletedGroups = project.groups.filter((g) => g.deleted);

  if (deletedPersonas.length === 0 && deletedGroups.length === 0)
    return <p className="text-sm text-gray-500">삭제된 항목이 없습니다. 캐릭터나 집단을 삭제하면 여기로 옮겨져 복구할 수 있습니다.</p>;

  return (
    <div className="space-y-6">
      {deletedPersonas.length > 0 && (
        <section>
          <h3 className="font-semibold">삭제된 캐릭터</h3>
          <ul className="mt-2 space-y-1">
            {deletedPersonas.map((per) => (
              <li key={per.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>{per.name}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() =>
                      update((p) => {
                        const t = p.personas.find((x) => x.id === per.id);
                        if (t) t.deleted = false;
                      })
                    }
                    className="rounded border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    복구
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`${per.name}을(를) 영구 삭제할까요? 되돌릴 수 없습니다.`))
                        update((p) => {
                          p.personas = p.personas.filter((x) => x.id !== per.id);
                          for (const g of p.groups) g.memberIds = g.memberIds.filter((m) => m !== per.id);
                        });
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    영구 삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {deletedGroups.length > 0 && (
        <section>
          <h3 className="font-semibold">삭제된 집단</h3>
          <ul className="mt-2 space-y-1">
            {deletedGroups.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>{g.name}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() =>
                      update((p) => {
                        const t = p.groups.find((x) => x.id === g.id);
                        if (t) t.deleted = false;
                      })
                    }
                    className="rounded border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    복구
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`${g.name}을(를) 영구 삭제할까요? 되돌릴 수 없습니다.`))
                        update((p) => void (p.groups = p.groups.filter((x) => x.id !== g.id)));
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    영구 삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
