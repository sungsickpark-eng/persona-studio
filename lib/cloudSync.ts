// 클라우드 저장(유료 기능) 동기화. localStorage가 항상 1차 저장소이고, 여기는 그 위에 얹는 부가 레이어일 뿐이다 —
// 로그인 안 했거나 구독 중이 아니면 모든 함수가 조용히 아무것도 안 한다(무료/비로그인 사용자는 이 파일의 영향을 전혀 안 받음).
import { loadProjects, saveProjects, type Project } from "./store";
import { createClient } from "./supabase/client";

let eligibleUserId: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

const SYNC_PREF_KEY = "persona-studio-cloud-sync-enabled";
// 지금 localStorage의 프로젝트 목록이 마지막으로 어느 계정 것이었는지 — 같은 브라우저에서 다른 계정으로 로그인했을 때
// 이전 계정의 로컬 프로젝트가 새 계정의 클라우드로 그대로 업로드돼버리는(saveProjects가 항상 업로드까지 트리거하므로)
// 사고를 막는 데만 쓴다. 무료/비로그인 사용자는 애초에 pullAndMergeCloudProjects를 안 타므로 영향 없음.
const LOCAL_OWNER_KEY = "persona-studio-local-owner";

function loadLocalOwner(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOCAL_OWNER_KEY);
}

function saveLocalOwner(userId: string) {
  localStorage.setItem(LOCAL_OWNER_KEY, userId);
}

// 구독 중이어도 "동시 저장"을 끄고 싶을 수 있어 브라우저별 로컬 설정으로 둔다 — 기본은 켜짐(기존 동작 유지).
// 구독 여부와 무관하게 저장만 해두고, 실제로 적용되는지는 AuthProvider가 구독 상태와 함께 판단한다.
export function loadCloudSyncPref(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SYNC_PREF_KEY) !== "off";
}

export function saveCloudSyncPref(enabled: boolean) {
  localStorage.setItem(SYNC_PREF_KEY, enabled ? "on" : "off");
}

// AuthProvider가 로그인/구독 상태가 바뀔 때마다 호출 — userId가 null이면 동기화가 완전히 꺼진다
export function setCloudSyncEligibility(userId: string | null) {
  eligibleUserId = userId;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

// saveProjects()가 매 호출 끝에 부른다. 디바운스 후 전체 배열을 그대로 upsert하고 로컬에 없는 클라우드 행은 지운다 —
// saveProjects 자체가 "항상 전체 배열을 덮어쓴다"는 방식이라 여기도 같은 방식을 따르는 게 가장 단순하고,
// 한 번 실패해도(오프라인 등) 다음 편집이 다시 전체를 보내므로 별도 재시도 큐가 필요 없다.
export function queueCloudSync(projects: Project[]) {
  if (!eligibleUserId) return;
  if (pushTimer) clearTimeout(pushTimer);
  const userId = eligibleUserId;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // 로컬이 아직 이 계정 걸로 정리되지 않았으면(계정을 바꿔 로그인한 직후, pullAndMergeCloudProjects가 아직 안 끝났을 수
    // 있는 짧은 순간) 업로드하지 않는다 — 마지막 방어선. pullAndMergeCloudProjects가 끝나면 owner가 맞춰지고 다음 저장부터 정상 업로드됨
    const owner = loadLocalOwner();
    if (owner && owner !== userId) return;
    pushToCloud(userId, projects).catch(() => {}); // 실패해도 다음 저장 때 전체를 다시 보내므로 조용히 무시
  }, 1500);
}

async function pushToCloud(userId: string, projects: Project[]) {
  const supabase = createClient();
  if (projects.length) {
    const rows = projects.map((p) => ({ id: p.id, user_id: userId, name: p.name, data: p, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("projects").upsert(rows);
    if (error) throw error;
  }
  const { data: existing, error: listErr } = await supabase.from("projects").select("id").eq("user_id", userId);
  if (listErr) throw listErr;
  const keep = new Set(projects.map((p) => p.id));
  const toDelete = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (toDelete.length) await supabase.from("projects").delete().in("id", toDelete);
}

// 로그인 직후(구독 중일 때) 또는 방금 구독한 직후 1회 호출 — 클라우드에는 있는데 로컬엔 없는 프로젝트를 로컬로 합친다.
// id 충돌 시 로컬 우선(필드 병합 없음). 합쳐진 결과를 항상 saveProjects로 다시 저장하므로 — 클라우드에 아직 아무것도
// 없는 "방금 구독한 사용자"의 경우에도(cloudOnly가 비어 있어도) 지금 로컬에 있는 프로젝트 전체가 큐잉되어 클라우드로 올라간다.
//
// 단, 지금 로컬에 있는 게 다른 계정 것으로 표시돼 있으면(같은 브라우저에서 계정을 바꿔 로그인한 경우) 절대 합치지 않는다 —
// 합치면 이전 계정의 프로젝트가 지금 계정의 user_id로 그대로 업로드돼 계정 간 데이터가 섞인다. 이 경우 로컬을 지금 계정의
// 클라우드 내용으로 통째로 교체한다(이전 계정 것은 그 계정 클라우드에 그대로 남아있으니 안전 — 다시 그 계정으로 로그인하면 보임).
// ponytail: 이전 계정의 "아직 클라우드에 못 올라간" 로컬 전용 편집이 있었다면(오프라인 등) 그건 버려진다 — 계정 전환 중
// 데이터 유실이 실제로 문제가 되면, 버리기 전에 별도 키에 백업해 복구 UI를 추가할 것.
//
// ponytail: Project에 updatedAt이 없어 진짜 last-write-wins는 못 함 — 두 기기가 같은 프로젝트를 오프라인으로 각각 고치면
// 조용히 한쪽이 사라질 수 있음. 필요해지면 Project.updatedAt을 추가하고 타임스탬프 비교로 바꿀 것.
export async function pullAndMergeCloudProjects(userId: string): Promise<Project[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("projects").select("id, data").eq("user_id", userId);
  if (error) throw error;
  const cloud = (data ?? []).map((row) => row.data as Project);

  const owner = loadLocalOwner();
  if (owner && owner !== userId) {
    saveLocalOwner(userId);
    saveProjects(cloud);
    return cloud;
  }

  const local = loadProjects();
  const localIds = new Set(local.map((p) => p.id));
  const cloudOnly = cloud.filter((p) => !localIds.has(p.id));
  const merged = cloudOnly.length ? [...local, ...cloudOnly] : local;
  saveLocalOwner(userId);
  saveProjects(merged); // cloudOnly가 없어도 항상 호출 — 로컬 전체를 클라우드로 밀어올리는 트리거 역할까지 겸함
  return merged;
}
