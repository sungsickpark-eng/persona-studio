// Google/Kakao 로그인 후 Supabase가 돌아오는 곳. 인가 코드를 세션 쿠키로 교환하고 앱 화면으로 돌려보낸다.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // next는 로그인 성공 후 돌아갈 위치 — 이 사이트 안의 경로만 허용한다("/"로 시작, "//"는 거부해 protocol-relative
  // 트릭으로 다른 사이트로 여는 오픈 리다이렉트를 막음). 그 외는 전부 기본값(/app)으로.
  const nextParam = searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/app?auth_error=1`);
}
