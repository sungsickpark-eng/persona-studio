// 이 브라우저(기기)의 로컬 상태(프로젝트 목록 lib/store.ts, 저장 폴더 연결 lib/rootFolder.ts)가 지금 어느 계정
// 걸로 취급돼야 하는지. 로그인 안 한 상태("비로그인 로컬")는 계정과 무관한 공용 저장소를 쓰고, 로그인하면(누가 됐든,
// 이 브라우저에서 처음이든 아니든) 그 계정만의 완전히 별도인 저장소로 전환된다 — 비로그인 때 있던 이야기가 로그인하는
// 순간 그 계정 것으로 자동으로 딸려 들어오지 않으며, 계정을 바꿔 로그인해도 서로의 데이터를 보거나 덮어쓰지 않는다.
//
// components/AuthProvider.tsx가 setUser와 같은 시점에 동기적으로 setActiveOwner를 불러야 한다(useEffect로 따로 빼면
// 다른 컴포넌트의 effect와 순서를 다툴 수 있어 레이스가 생김 — 모듈 변수 대입은 React 렌더 사이클과 무관하게 즉시 반영됨).
let activeOwner: string | null = null;

export function setActiveOwner(userId: string | null) {
  activeOwner = userId;
}

// 지금 저장소 키에 붙일 접미사 — 비로그인이면 "", 로그인 중이면 ":그계정id"
export function ownerSuffix(): string {
  return activeOwner ? `:${activeOwner}` : "";
}
