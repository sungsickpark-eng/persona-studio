// 나이트 모드 — 브라우저 전역(프로젝트 무관) 설정. 시스템 설정을 기본값으로 쓰되, 사용자가 한 번 명시적으로
// 고르면 그 뒤로는 시스템이 바뀌어도 이 선택을 유지한다("다시 시스템 따라가기"는 지원하지 않음 — 라이트/다크
// 두 상태만 오가는 단순한 토글이 "나이트 모드 버튼"이라는 요청에 더 맞음).
export type Theme = "light" | "dark";
const KEY = "persona-studio-theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// layout.tsx의 부트스트랩 <script>에 그대로 문자열로 박아 넣는 로직 — 페인트 전에 동기 실행돼야
// 시스템이 다크인데 잠깐 라이트로 번쩍이는(FOUC) 현상이 안 생긴다. 위 함수들과 로직은 같지만
// 모듈 임포트가 안 되는 인라인 스크립트라 문자열로 따로 유지한다.
export const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("${KEY}");
    var theme = stored === "light" || stored === "dark" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;
