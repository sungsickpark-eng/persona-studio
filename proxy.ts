// Supabase 세션 쿠키 갱신. Next.js 16부터 middleware.ts가 proxy.ts로 이름이 바뀌었다(기능은 동일) —
// middleware.ts로 만들면 조용히 실행되지 않으니 반드시 이 파일명을 쓴다.
// Supabase 환경변수가 없으면(클라우드 저장 미설정) 그냥 통과시킨다 — 무료 로컬 전용 사용에는 전혀 관여하지 않는다.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  await supabase.auth.getUser(); // 만료된 세션이면 여기서 쿠키를 갱신함 (반환값은 필요 없음)
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
