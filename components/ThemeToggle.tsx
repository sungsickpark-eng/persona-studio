"use client";
import { useEffect, useState } from "react";
import { resolveTheme, setTheme, type Theme } from "@/lib/theme";

// 헤더에 박아 쓰는 라이트/다크 토글. 마운트 전엔 서버가 모르는 값(localStorage/시스템 설정)이라
// 하이드레이션 불일치를 피하려고 첫 렌더는 항상 "light" 아이콘으로 그린 뒤, 마운트 후 실제 값으로 갱신한다
// (layout.tsx의 부트스트랩 스크립트가 이미 <html data-theme>를 맞게 세팅해뒀으니 화면 자체는 깜빡이지 않음 —
// 이 버튼의 아이콘만 한 박자 늦게 정확해짐).
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    // 마운트 후 한 번, 서버는 모르는 클라이언트 전용 값(localStorage/시스템 설정)을 읽어 아이콘만 맞춰줌 —
    // 실제 <html data-theme>는 이미 부트스트랩 스크립트가 페인트 전에 정확히 세팅해뒀으니 화면 자체는 안 깜빡임
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(resolveTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "라이트 모드로 전환" : "나이트 모드로 전환"}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "나이트 모드로 전환"}
      className={className}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
