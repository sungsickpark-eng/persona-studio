// 이 브라우저(기기)의 로컬 상태(프로젝트 목록 lib/store.ts, 저장 폴더 연결 lib/rootFolder.ts)를 지금 로그인된 계정이
// "공용" 저장소(계정 구분이 생기기 전부터 쓰던 단일 키)로 계속 써도 되는지 판단한다.
//
// 이 기기에 맨 처음 로그인한 계정("주인")은 계속 공용 저장소를 그대로 쓴다 — 그래야 이 기능이 생기기 전부터 있던
// 로컬 데이터(프로젝트, 연결된 저장 폴더)가 사라지지 않는다. 로그인 안 한 상태도 공용 저장소를 쓴다(기존 동작 그대로).
// 그 이후 다른 계정으로 로그인하면 그 계정만 별도 네임스페이스(키 뒤에 :userId)를 새로 받아, 서로의 로컬 데이터를
// 보거나 덮어쓸 일이 없다 — 같은 브라우저에서 계정을 바꿔 로그인해도 이전 계정 것이 안 보이는 이유가 이것.
//
// components/AuthProvider.tsx가 setUser와 같은 시점에 동기적으로 setActiveOwner를 불러야 한다(useEffect로 따로 빼면
// 다른 컴포넌트의 effect와 순서를 다툴 수 있어 레이스가 생김 — 모듈 변수 대입은 React 렌더 사이클과 무관하게 즉시 반영됨).
let activeOwner: string | null = null;
const CLAIM_KEY = "persona-studio-device-claim";

export function setActiveOwner(userId: string | null) {
  activeOwner = userId;
  if (typeof window === "undefined" || !userId) return;
  if (!localStorage.getItem(CLAIM_KEY)) localStorage.setItem(CLAIM_KEY, userId);
}

// 지금 저장소 키에 붙일 접미사 — 공용 저장소를 쓰면 "", 아니면 ":그계정id"
export function ownerSuffix(): string {
  if (!activeOwner || typeof window === "undefined") return "";
  const claimedBy = localStorage.getItem(CLAIM_KEY);
  return !claimedBy || claimedBy === activeOwner ? "" : `:${activeOwner}`;
}
