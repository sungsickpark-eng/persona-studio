// 관리자 판별 — 별도 role 테이블 없이, 서버 전용 환경변수(ADMIN_EMAILS)에 등록된 이메일인지만 확인한다.
// 관리자 API 라우트(app/api/admin/**)는 전부 이 함수로 세션을 확인한 뒤에만 데이터를 내준다 —
// /admin 페이지 자체는 다른 페이지들처럼 클라이언트 컴포넌트라 화면 틀은 누구나 열리지만, 실제 데이터는
// 이 체크를 통과한 요청에만 나간다(RLS와 같은 이치: 화면이 아니라 서버가 마지막 방어선).
import { createClient } from "@/lib/supabase/server";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

// 지금 요청의 세션이 관리자면 {id, email}을, 아니면 null을 돌려준다 — 호출부는 null이면 403으로 막을 것.
export async function requireAdmin(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) return null;
  return { id: user.id, email: user.email };
}
