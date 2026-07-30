"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import {
  findRelation,
  newRelation,
  relationLabel,
  type PersonaGroupRelation,
  type Project,
  type Relation,
} from "@/lib/store";

const W = 900; // 지도처럼 화면 전체를 채우는 SVG 좌표계 너비 (물리 시뮬레이션이 뛰노는 고정 캔버스 — 오브시디언 그래프 뷰처럼 콘텐츠양과 무관하게 고정)
const H = 640;
const NODE_R = 28;

// 오브시디언 그래프 뷰의 "힘" 설정과 동일한 개념의 기본값 — 반발력(노드끼리 밀어냄)/중심 장력(가운데로 당김)/링크 장력·거리(연결된 노드끼리 당김)
const DEFAULT_REPEL = -260;
const DEFAULT_CENTER = 0.06;
const DEFAULT_LINK_FORCE = 0.5;
const DEFAULT_LINK_DISTANCE = 130;

// 캐릭터 원 색상 팔레트 — Tailwind JIT가 정적 문자열을 스캔하므로 완전한 클래스명으로 나열
const PALETTE = [
  { fill: "fill-emerald-400", ring: "stroke-emerald-400" },
  { fill: "fill-sky-400", ring: "stroke-sky-400" },
  { fill: "fill-amber-400", ring: "stroke-amber-400" },
  { fill: "fill-rose-400", ring: "stroke-rose-400" },
  { fill: "fill-indigo-400", ring: "stroke-indigo-400" },
  { fill: "fill-teal-400", ring: "stroke-teal-400" },
] as const;

// 관계 지수(1~100)에 따른 선 색상 — 완전한 클래스명으로 나열 (Tailwind JIT 스캔용)
function relationStroke(score: number): string {
  if (score < 20) return "stroke-red-500";
  if (score < 40) return "stroke-orange-400";
  if (score < 60) return "stroke-gray-400 dark:stroke-gray-500";
  if (score < 80) return "stroke-sky-400";
  return "stroke-pink-400";
}

// relationStroke와 같은 팔레트를 라벨 텍스트 색상(fill)으로 — 캐릭터 간/집단 간 관계 점수를 항상 보이는 라벨로 표시할 때 씀
function relationFill(score: number): string {
  if (score < 20) return "fill-red-500";
  if (score < 40) return "fill-orange-400";
  if (score < 60) return "fill-gray-500 dark:fill-gray-300";
  if (score < 80) return "fill-sky-500";
  return "fill-pink-500";
}

// CSS object-fit:cover + object-position과 동일한 계산 — 정사각형 박스를 채우도록 이미지를 확대하고,
// fx/fy(0~100%) 위치가 잘려나가는 여백 중 몇 %를 남길지 결정한다
function coverRect(imgW: number, imgH: number, box: number, fx: number, fy: number) {
  const scale = Math.max(box / imgW, box / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { w, h, offsetX: -((w - box) * fx) / 100, offsetY: -((h - box) * fy) / 100 };
}

type Pos = { x: number; y: number };
type NodeType = "persona" | "group";
type Drag = { type: NodeType; id: string; x: number; y: number; hoverId: string | null; startClientX: number; startClientY: number };

interface SimNode extends SimulationNodeDatum {
  id: string;
  type: NodeType;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string;
}

function toggleMembership(p: Project, personaId: string, groupId: string) {
  const g = p.groups.find((x) => x.id === groupId);
  if (!g) return;
  g.memberIds = g.memberIds.includes(personaId)
    ? g.memberIds.filter((m) => m !== personaId)
    : [...g.memberIds, personaId];
}

function toggleRelation(p: Project, key: "personaRelations" | "groupRelations", aId: string, bId: string) {
  const list = p[key];
  const existing = findRelation(list, aId, bId);
  p[key] = existing ? list.filter((r) => r.id !== existing.id) : [...list, newRelation(aId, bId)];
}

type Props = { project: Project; update: (fn: (p: Project) => void) => void; onSelect?: (type: NodeType, id: string) => void };

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.2;

export default function RelationshipGraph({ project, update, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);

  // 오브시디언 그래프 뷰와 동일한 개념의 힘 파라미터 — 세션 로컬(프로젝트 데이터에는 저장 안 함)
  const [repelForce, setRepelForce] = useState(DEFAULT_REPEL);
  const [centerForce, setCenterForce] = useState(DEFAULT_CENTER);
  const [linkForce, setLinkForce] = useState(DEFAULT_LINK_FORCE);
  const [linkDistance, setLinkDistance] = useState(DEFAULT_LINK_DISTANCE);
  const [showForceSettings, setShowForceSettings] = useState(false);

  // 물리 시뮬레이션 본체 — 노드 위치(x,y)는 이 안에서 매 틱마다 갱신되는 살아있는 객체라 ref로 들고 렌더링 때마다 직접 읽는다
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<Map<string, SimNode>>(new Map());
  const chargeForceRef = useRef(forceManyBody());
  const linkForceRef = useRef(forceLink<SimNode, SimLink>().id((d) => d.id));
  const xForceRef = useRef(forceX<SimNode>(W / 2));
  const yForceRef = useRef(forceY<SimNode>(H / 2));
  // 렌더링은 이 state만 읽는다 — nodesRef는 시뮬레이션이 매 틱마다 직접 mutate하는 살아있는 객체라
  // 렌더 중에 ref.current를 읽으면 안 되므로(react-hooks/refs), 틱마다 여기로 스냅샷을 떠서 리렌더를 트리거한다
  const [positions, setPositions] = useState<Map<string, Pos>>(new Map());

  const activePersonas = project.personas.filter((p) => !p.deleted);
  const activeGroups = project.groups.filter((g) => !g.deleted);

  // 노드: 캐릭터 + 집단. 링크: 소속/상하위/캐릭터-캐릭터/집단-집단/캐릭터-집단 관계 전부를 하나의 힘으로 통합(오브시디언처럼 링크 종류를 구분하지 않고 하나의 링크 장력으로 조정)
  const nodeIds = [...activePersonas.map((p) => p.id), ...activeGroups.map((g) => g.id)];
  const links: { id: string; source: string; target: string }[] = [
    ...activePersonas.flatMap((per) =>
      activeGroups.filter((g) => g.memberIds.includes(per.id)).map((g) => ({ id: `m-${per.id}-${g.id}`, source: per.id, target: g.id })),
    ),
    ...activeGroups.filter((g) => g.parentId).map((g) => ({ id: `h-${g.id}`, source: g.parentId!, target: g.id })),
    ...project.personaRelations.filter((r) => r.aware).map((r) => ({ id: `p-${r.id}`, source: r.aId, target: r.bId })),
    ...project.groupRelations.filter((r) => r.aware).map((r) => ({ id: `g-${r.id}`, source: r.aId, target: r.bId })),
    ...project.personaGroupRelations
      .filter((r) => r.personaAware || r.groupAware)
      .map((r) => ({ id: `pg-${r.id}`, source: r.personaId, target: r.groupId })),
  ];
  const nodesKey = nodeIds.join(",");
  const linksKey = links.map((l) => l.id).join(",");

  // 시뮬레이션은 최초 동기화 때 한 번만 만들고 계속 돌린다(틱마다 positions 스냅샷을 떠서 다시 그림).
  // 생성과 노드/링크 동기화를 한 effect에 묶어야 "생성 effect가 동기화 effect보다 먼저 실행된다"는 순서를 보장할 수 있다
  // (layout effect는 선언 순서와 무관하게 이 컴포넌트 안에서는 항상 먼저 실행되므로, 별도 effect로 나누면 동기화가 먼저 돌아 sim이 아직 null일 수 있음)
  useLayoutEffect(() => {
    if (!simRef.current) {
      simRef.current = forceSimulation<SimNode, SimLink>([])
        .force("charge", chargeForceRef.current)
        .force("link", linkForceRef.current)
        .force("x", xForceRef.current)
        .force("y", yForceRef.current)
        .on("tick", () => {
          const snapshot = new Map<string, Pos>();
          nodesRef.current.forEach((n, id) => {
            if (n.x !== undefined && n.y !== undefined) snapshot.set(id, { x: n.x, y: n.y });
          });
          setPositions(snapshot);
        });
    }
    // 캐릭터/집단/관계가 실제로 늘거나 줄었을 때만 노드·링크를 다시 동기화하고 재가열한다
    // (다른 탭에서 무관한 내용을 편집해도 project 참조가 바뀌어 매 렌더 실행되므로, 문자열 키로 실제 구조 변화만 걸러낸다)
    const sim = simRef.current;
    const nodeMap = nodesRef.current;
    for (const id of Array.from(nodeMap.keys())) {
      if (!nodeIds.includes(id)) nodeMap.delete(id);
    }
    nodeIds.forEach((id, i) => {
      if (nodeMap.has(id)) return;
      const type: NodeType = activePersonas.some((p) => p.id === id) ? "persona" : "group";
      // 새 노드는 겹치지 않도록 중심 근처에 골든 앵글로 흩어서 시작 (기존 노드는 지금 위치 유지)
      const angle = i * 2.399963;
      const r = 60 + i * 8;
      nodeMap.set(id, { id, type, x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r });
    });
    sim.nodes(Array.from(nodeMap.values()));
    linkForceRef.current.links(links.map((l) => ({ id: l.id, source: l.source, target: l.target })));
    sim.alpha(0.6).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesKey, linksKey]);

  // 언마운트 시에만 시뮬레이션을 멈춘다 (생성은 위 동기화 effect 안에서 지연 생성)
  useEffect(() => {
    return () => {
      simRef.current?.stop();
      simRef.current = null;
    };
  }, []);

  // 힘 슬라이더가 바뀌면 파라미터를 갱신하고 다시 가열(reheat)해 변화를 바로 눈으로 확인할 수 있게 한다
  useEffect(() => {
    chargeForceRef.current.strength(repelForce);
    xForceRef.current.strength(centerForce);
    yForceRef.current.strength(centerForce);
    linkForceRef.current.strength(linkForce).distance(linkDistance);
    simRef.current?.alpha(0.5).restart();
  }, [repelForce, centerForce, linkForce, linkDistance]);

  if (activePersonas.length === 0 && activeGroups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-gray-700">
        캐릭터나 집단을 만들면 여기에 관계도가 지도처럼 나타납니다.
      </div>
    );
  }

  const nodePos = (id: string): Pos | undefined => positions.get(id);

  // 틀(테두리) 크기는 그대로 두고, viewBox의 창 크기만 줄이거나 늘려서 내용을 확대/축소한다 — 화면 중심을 유지한 채로 줌
  const viewW = W / zoom;
  const viewH = H / zoom;
  // 함수형 업데이트로 처리 — 클릭이 연달아 빠르게 들어와도(리렌더 사이 간격 없이) 이전 클릭 결과를 누락하지 않음
  const changeZoom = (delta: number) => {
    setZoom((prevZoom) => {
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom + delta));
      if (newZoom === prevZoom) return prevZoom;
      setPan((prevPan) => {
        const prevViewW = W / prevZoom;
        const prevViewH = H / prevZoom;
        const centerX = prevPan.x + prevViewW / 2;
        const centerY = prevPan.y + prevViewH / 2;
        const newViewW = W / newZoom;
        const newViewH = H / newZoom;
        return { x: centerX - newViewW / 2, y: centerY - newViewH / 2 };
      });
      return newZoom;
    });
  };
  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };
  const resetForces = () => {
    setRepelForce(DEFAULT_REPEL);
    setCenterForce(DEFAULT_CENTER);
    setLinkForce(DEFAULT_LINK_FORCE);
    setLinkDistance(DEFAULT_LINK_DISTANCE);
  };
  const forcesChanged =
    repelForce !== DEFAULT_REPEL || centerForce !== DEFAULT_CENTER || linkForce !== DEFAULT_LINK_FORCE || linkDistance !== DEFAULT_LINK_DISTANCE;

  // 캐릭터 -> 소속된 모든 집단으로 선 연결 (다중 소속 지원)
  const memberEdges = activePersonas.flatMap((per) => {
    const from = nodePos(per.id);
    if (!from) return [];
    return activeGroups
      .map((g) => {
        if (!g.memberIds.includes(per.id)) return null;
        const to = nodePos(g.id);
        return to ? { key: `m-${per.id}-${g.id}`, from, to, personaId: per.id, groupId: g.id } : null;
      })
      .filter((e): e is { key: string; from: Pos; to: Pos; personaId: string; groupId: string } => !!e);
  });

  // 집단 상위-하위 트리 연결선 (학교 > 학년 > 학급). 편집은 '집단' 탭의 상위 집단 선택으로만 하므로 클릭 상호작용 없음
  const hierarchyEdges = activeGroups.flatMap((g) => {
    if (!g.parentId) return [];
    const from = nodePos(g.parentId);
    const to = nodePos(g.id);
    return from && to ? [{ key: `h-${g.id}`, from, to }] : [];
  });

  // 캐릭터-캐릭터 관계선 ('존재를 모름' 관계는 실제 연결이 아니므로 그래프에는 그리지 않음 — '관계' 탭에서만 관리)
  const personaRelEdges = project.personaRelations
    .filter((r) => r.aware)
    .map((r) => {
      const from = nodePos(r.aId);
      const to = nodePos(r.bId);
      return from && to ? { key: `p-${r.id}`, from, to, relation: r } : null;
    })
    .filter((e): e is { key: string; from: Pos; to: Pos; relation: Relation } => !!e);

  // 집단-집단 관계선 (마찬가지로 '존재를 모름'은 제외)
  const groupRelEdges = project.groupRelations
    .filter((r) => r.aware)
    .map((r) => {
      const from = nodePos(r.aId);
      const to = nodePos(r.bId);
      return from && to ? { key: `g-${r.id}`, from, to, relation: r } : null;
    })
    .filter((e): e is { key: string; from: Pos; to: Pos; relation: Relation } => !!e);

  // 캐릭터-집단 관계선 (소속 여부와 무관). 양쪽 다 모르면 실질적 연결이 없으므로 제외 — 한쪽만 알아도(비대칭) 표시
  const pgRelEdges = project.personaGroupRelations
    .filter((r) => r.personaAware || r.groupAware)
    .map((r) => {
      const from = nodePos(r.personaId);
      const to = nodePos(r.groupId);
      return from && to ? { key: `pg-${r.id}`, from, to, relation: r } : null;
    })
    .filter((e): e is { key: string; from: Pos; to: Pos; relation: PersonaGroupRelation } => !!e);

  const toSvgPoint = (clientX: number, clientY: number): Pos => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const dropTargetAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const node = el?.closest("[data-node-id]");
    const id = node?.getAttribute("data-node-id");
    const type = node?.getAttribute("data-node-type") as NodeType | null;
    return id && type ? { id, type } : null;
  };

  const startDrag = (e: React.PointerEvent, type: NodeType, id: string) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toSvgPoint(e.clientX, e.clientY);
    setDrag({ type, id, x: p.x, y: p.y, hoverId: null, startClientX: e.clientX, startClientY: e.clientY });
  };

  // 빈 배경(노드가 아닌 곳)을 누르면 시작 — 노드 드래그는 startDrag에서 stopPropagation돼서 여기까지 안 옴
  const onSvgPointerDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    panStartRef.current = { clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag) {
      const p = toSvgPoint(e.clientX, e.clientY);
      const target = dropTargetAt(e.clientX, e.clientY);
      const hoverId = target && target.id !== drag.id ? target.id : null;
      setDrag({ ...drag, x: p.x, y: p.y, hoverId });
      return;
    }
    if (panStartRef.current) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = viewW / rect.width; // 화면 픽셀 -> viewBox 단위 변환 비율 (줌 배율 반영)
      const dx = (e.clientX - panStartRef.current.clientX) * scale;
      const dy = (e.clientY - panStartRef.current.clientY) * scale;
      setPan({ x: panStartRef.current.panX - dx, y: panStartRef.current.panY - dy });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (panStartRef.current) {
      panStartRef.current = null;
      return;
    }
    if (!drag) return;
    const target = dropTargetAt(e.clientX, e.clientY);
    if (target && target.id !== drag.id) {
      if (drag.type === "persona" && target.type === "persona") {
        update((p) => toggleRelation(p, "personaRelations", drag.id, target.id));
      } else if (drag.type === "group" && target.type === "group") {
        update((p) => toggleRelation(p, "groupRelations", drag.id, target.id));
      } else {
        const personaId = drag.type === "persona" ? drag.id : target.type === "persona" ? target.id : null;
        const groupId = drag.type === "group" ? drag.id : target.type === "group" ? target.id : null;
        if (personaId && groupId) update((p) => toggleMembership(p, personaId, groupId));
      }
    } else {
      // 드래그 없이(거의 움직이지 않고) 놓았다면 클릭으로 간주 — 해당 캐릭터/집단의 설정 화면을 연다
      const moved = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (moved < 4) onSelect?.(drag.type, drag.id);
    }
    setDrag(null);
  };

  const origin = drag ? nodePos(drag.id) : null;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* 오버레이 컨트롤(줌·힘 설정)은 잘리는 카드 바깥(이 wrapper 기준)에 둬 카드가 낮아져도 안 잘리게 함 */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        {(pan.x !== 0 || pan.y !== 0 || zoom !== 1) && (
          <button
            onClick={resetView}
            className="rounded border border-gray-300 bg-white/90 px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-white dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300"
          >
            위치 초기화
          </button>
        )}
        <div className="flex items-center gap-1 rounded border border-gray-300 bg-white/90 px-1 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900/90">
          <button
            onClick={() => changeZoom(-ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="관계도 내용 축소"
            className="h-6 w-6 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            −
          </button>
          <span className="w-10 text-center text-xs text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => changeZoom(ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="관계도 내용 확대"
            className="h-6 w-6 rounded text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            +
          </button>
        </div>
        <button
          onClick={() => setShowForceSettings((v) => !v)}
          title="반발력·중심 장력·링크 장력/거리 조정 (오브시디언 그래프 뷰와 같은 힘 설정)"
          aria-label="힘 설정 열기"
          className={`h-7 w-7 rounded border text-xs shadow-sm ${
            showForceSettings
              ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-600 dark:border-fuchsia-500 dark:bg-fuchsia-950/40 dark:text-fuchsia-300"
              : "border-gray-300 bg-white/90 text-gray-600 hover:bg-white dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300"
          }`}
        >
          ⚙
        </button>
      </div>

      {showForceSettings && (
        <div className="absolute right-3 top-14 z-10 w-56 space-y-2.5 rounded border border-gray-300 bg-white/95 p-3 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900/95">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-600 dark:text-gray-300">힘 설정</span>
            {forcesChanged && (
              <button onClick={resetForces} className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
                기본값
              </button>
            )}
          </div>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">반발력 {repelForce}</span>
            <input
              type="range"
              min={-1000}
              max={-20}
              step={20}
              value={repelForce}
              onChange={(e) => setRepelForce(+e.target.value)}
              className="mt-0.5 w-full"
            />
          </label>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">중심 장력 {centerForce.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={centerForce}
              onChange={(e) => setCenterForce(+e.target.value)}
              className="mt-0.5 w-full"
            />
          </label>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">링크 장력 {linkForce.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={linkForce}
              onChange={(e) => setLinkForce(+e.target.value)}
              className="mt-0.5 w-full"
            />
          </label>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">링크 거리 {linkDistance}</span>
            <input
              type="range"
              min={40}
              max={300}
              step={10}
              value={linkDistance}
              onChange={(e) => setLinkDistance(+e.target.value)}
              className="mt-0.5 w-full"
            />
          </label>
        </div>
      )}

      {/* 그래프 내용은 이 카드 안에서만 그려지도록 잘라낸다 — 노드는 팬/줌 창 밖으로 자유롭게 움직일 수 있어(위 오버레이 컨트롤과 달리), 잘리지 않으면 테두리 밖으로 삐져나와 보임 */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm dark:border-gray-800 dark:from-gray-900 dark:to-gray-950">
      <svg
        ref={svgRef}
        viewBox={`${pan.x} ${pan.y} ${viewW} ${viewH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block cursor-grab touch-none select-none overflow-visible active:cursor-grabbing"
        onPointerDown={onSvgPointerDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          setDrag(null);
          panStartRef.current = null;
        }}
      >
        <defs>
          <linearGradient id="rg-group" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
          <linearGradient id="rg-group-hover" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
          {/* 단방향 캐릭터 관계선 끝에 붙는 화살표 (A→B 방향 표시) */}
          <marker id="rg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="fill-slate-500 dark:fill-slate-300" />
          </marker>
        </defs>

        {hierarchyEdges.map((e) => (
          <line
            key={e.key}
            x1={e.from.x}
            y1={e.from.y}
            x2={e.to.x}
            y2={e.to.y}
            className="stroke-slate-400/60 dark:stroke-slate-500/50"
            strokeWidth={2}
            pointerEvents="none"
          />
        ))}

        {memberEdges.map((e) => {
          const isHovered = hoverEdge === e.key;
          return (
            <g key={e.key}>
              <line
                x1={e.from.x}
                y1={e.from.y}
                x2={e.to.x}
                y2={e.to.y}
                className={isHovered ? "stroke-red-500" : "stroke-indigo-400/70 dark:stroke-indigo-300/50"}
                strokeWidth={isHovered ? 3.5 : 2.5}
                strokeDasharray={isHovered ? "5 3" : undefined}
                strokeLinecap="round"
                pointerEvents="none"
              />
              {/* 클릭/호버 판정 영역을 넓히기 위한 투명 굵은 선 (소속 해제) */}
              <line
                x1={e.from.x}
                y1={e.from.y}
                x2={e.to.x}
                y2={e.to.y}
                stroke="transparent"
                strokeWidth={14}
                className="cursor-pointer"
                onPointerEnter={() => setHoverEdge(e.key)}
                onPointerLeave={() => setHoverEdge((h) => (h === e.key ? null : h))}
                onClick={() => update((p) => toggleMembership(p, e.personaId, e.groupId))}
              >
                <title>클릭하면 소속이 해제됩니다</title>
              </line>
            </g>
          );
        })}

        {[...personaRelEdges, ...groupRelEdges].map((e) => {
          const isHovered = hoverEdge === e.key;
          const isGroupRel = e.key.startsWith("g-");
          const directed = !isGroupRel && !e.relation.mutual;
          const directionNote = directed
            ? ` · 단방향(${activePersonas.find((p) => p.id === e.relation.aId)?.name ?? "?"} → ${activePersonas.find((p) => p.id === e.relation.bId)?.name ?? "?"})`
            : "";
          return (
            <g key={e.key}>
              <line
                x1={e.from.x}
                y1={e.from.y}
                x2={e.to.x}
                y2={e.to.y}
                className={isHovered ? "stroke-red-500" : relationStroke(e.relation.score)}
                strokeWidth={isHovered ? 4.5 : 1.6 + (e.relation.score / 100) * 3.5}
                strokeDasharray={isHovered ? "7 4" : isGroupRel ? "9 4" : undefined}
                strokeLinecap="round"
                markerEnd={directed ? "url(#rg-arrow)" : undefined}
                pointerEvents="none"
              />
              <line
                x1={e.from.x}
                y1={e.from.y}
                x2={e.to.x}
                y2={e.to.y}
                stroke="transparent"
                strokeWidth={14}
                className="cursor-pointer"
                onPointerEnter={() => setHoverEdge(e.key)}
                onPointerLeave={() => setHoverEdge((h) => (h === e.key ? null : h))}
                onClick={() =>
                  update((p) => {
                    const listKey = isGroupRel ? "groupRelations" : "personaRelations";
                    p[listKey] = p[listKey].filter((r) => r.id !== e.relation.id);
                  })
                }
              >
                <title>{`관계 지수 ${e.relation.score}/100 (${relationLabel(true, e.relation.score)})${directionNote} · 클릭하면 삭제됩니다`}</title>
              </line>
            </g>
          );
        })}

        {pgRelEdges.map((e) => {
          const isHovered = hoverEdge === e.key;
          const { personaAware, groupAware } = e.relation;
          const asymmetric = personaAware !== groupAware;
          return (
            <g key={e.key}>
              <line
                x1={e.from.x}
                y1={e.from.y}
                x2={e.to.x}
                y2={e.to.y}
                className={isHovered ? "stroke-red-500" : relationStroke(e.relation.score)}
                strokeWidth={isHovered ? 4.5 : 1.6 + (e.relation.score / 100) * 3.5}
                strokeDasharray={isHovered ? "7 4" : asymmetric ? "1.5 4" : "2 2"}
                strokeLinecap="round"
                pointerEvents="none"
              />
              <line
                x1={e.from.x}
                y1={e.from.y}
                x2={e.to.x}
                y2={e.to.y}
                stroke="transparent"
                strokeWidth={14}
                className="cursor-pointer"
                onPointerEnter={() => setHoverEdge(e.key)}
                onPointerLeave={() => setHoverEdge((h) => (h === e.key ? null : h))}
                onClick={() =>
                  update((p) => {
                    p.personaGroupRelations = p.personaGroupRelations.filter((r) => r.id !== e.relation.id);
                  })
                }
              >
                <title>{`관계 지수 ${e.relation.score}/100 · 캐릭터가 집단을 ${personaAware ? "앎" : "모름"} · 집단이 캐릭터를 ${groupAware ? "앎" : "모름"} · 클릭하면 삭제됩니다`}</title>
              </line>
            </g>
          );
        })}

        {drag && origin && (
          <line
            x1={origin.x}
            y1={origin.y}
            x2={drag.x}
            y2={drag.y}
            className="stroke-fuchsia-500"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray="7 5"
            pointerEvents="none"
          />
        )}

        {activeGroups.map((g) => {
          const pos = nodePos(g.id);
          if (!pos) return null;
          const w = Math.max(80, g.name.length * 10.5 + 30);
          const hovered = drag?.hoverId === g.id;
          return (
            <g
              key={g.id}
              data-node-id={g.id}
              data-node-type="group"
              onPointerDown={(e) => startDrag(e, "group", g.id)}
              className="cursor-grab drop-shadow-md transition-transform active:cursor-grabbing"
            >
              <title>{`클릭: ${g.name} 설정 열기 · 드래그: 소속/관계 연결`}</title>
              <rect
                x={pos.x - w / 2}
                y={pos.y - 16}
                width={w}
                height={32}
                rx={16}
                fill={hovered ? "url(#rg-group-hover)" : "url(#rg-group)"}
                className={hovered ? "drop-shadow-[0_0_8px_rgba(217,70,239,0.55)]" : ""}
              />
              {hovered && (
                <rect x={pos.x - w / 2 - 4} y={pos.y - 20} width={w + 8} height={40} rx={20} fill="none" className="stroke-fuchsia-400" strokeWidth={2} strokeDasharray="4 3" />
              )}
              <text x={pos.x} y={pos.y + 5.5} textAnchor="middle" fontSize={16} className="fill-white font-bold tracking-tight">
                {g.name}
              </text>
            </g>
          );
        })}

        {activePersonas.map((per, idx) => {
          const pos = nodePos(per.id);
          if (!pos) return null;
          const clipId = `clip-${per.id}`;
          const hovered = drag?.hoverId === per.id;
          const color = PALETTE[idx % PALETTE.length];
          return (
            <g
              key={per.id}
              data-node-id={per.id}
              data-node-type="persona"
              onPointerDown={(e) => startDrag(e, "persona", per.id)}
              className="cursor-grab drop-shadow-md active:cursor-grabbing"
            >
              <title>{`클릭: ${per.name} 설정 열기 · 드래그: 소속/관계 연결`}</title>
              {per.image ? (
                <>
                  <clipPath id={clipId}>
                    <circle cx={pos.x} cy={pos.y} r={NODE_R - 2} />
                  </clipPath>
                  {per.imageWidth && per.imageHeight ? (
                    (() => {
                      const box = (NODE_R - 2) * 2;
                      const cover = coverRect(
                        per.imageWidth,
                        per.imageHeight,
                        box,
                        per.imagePosition?.x ?? 50,
                        per.imagePosition?.y ?? 50,
                      );
                      return (
                        <image
                          href={per.image}
                          x={pos.x - box / 2 + cover.offsetX}
                          y={pos.y - box / 2 + cover.offsetY}
                          width={cover.w}
                          height={cover.h}
                          clipPath={`url(#${clipId})`}
                          preserveAspectRatio="none"
                        />
                      );
                    })()
                  ) : (
                    <image
                      href={per.image}
                      x={pos.x - (NODE_R - 2)}
                      y={pos.y - (NODE_R - 2)}
                      width={(NODE_R - 2) * 2}
                      height={(NODE_R - 2) * 2}
                      clipPath={`url(#${clipId})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  )}
                </>
              ) : (
                <>
                  <circle cx={pos.x} cy={pos.y} r={NODE_R - 2} className={color.fill} />
                  <text x={pos.x} y={pos.y + 6} textAnchor="middle" fontSize={20} className="fill-white font-bold">
                    {per.name.slice(0, 1)}
                  </text>
                </>
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={NODE_R}
                fill="none"
                className={hovered ? "stroke-fuchsia-500" : color.ring}
                strokeWidth={hovered ? 4 : 2.5}
                strokeOpacity={hovered ? 1 : 0.9}
              />
              <rect x={pos.x - 34} y={pos.y + NODE_R + 4} width={68} height={18} rx={9} className="fill-white/85 dark:fill-gray-900/85" />
              <text x={pos.x} y={pos.y + NODE_R + 17} textAnchor="middle" fontSize={14} className="fill-gray-600 font-medium dark:fill-gray-300">
                {per.name}
              </text>
            </g>
          );
        })}

        {/* 캐릭터 간/집단 간 관계 지수를 호버 없이도 한눈에 볼 수 있도록 항상 표시하는 라벨 — 노드보다 나중에 그려서 겹쳐도 가려지지 않게 함 */}
        {[...personaRelEdges, ...groupRelEdges].map((e) => {
          const isHovered = hoverEdge === e.key;
          const midX = (e.from.x + e.to.x) / 2;
          const midY = (e.from.y + e.to.y) / 2;
          return (
            <g key={`label-${e.key}`} pointerEvents="none">
              <rect x={midX - 15} y={midY - 11} width={30} height={22} rx={7} className="fill-white/90 dark:fill-gray-900/90" />
              <text
                x={midX}
                y={midY + 5.5}
                textAnchor="middle"
                fontSize={14}
                className={isHovered ? "fill-red-500 font-bold" : `${relationFill(e.relation.score)} font-bold`}
              >
                {e.relation.score}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
      <p className="mt-2 shrink-0 text-center text-[11px] text-gray-400">
우상단 ⚙로 반발력·중심 장력·링크 장력/거리 조정(오브시디언 그래프 뷰와 동일한 물리 시뮬레이션) · +/-로 확대·축소 · 노드 클릭으로 설정 열기 · 빈 배경 드래그로 화면 이동 · 노드 드래그로 소속·관계 연결/해제 · 선 위 숫자는 캐릭터 간/집단 간 관계 지수 · 회색 선은 집단 상위-하위 구조 · 점선은 캐릭터-집단 관계 · 화살표는 단방향 관계
      </p>
    </div>
  );
}
