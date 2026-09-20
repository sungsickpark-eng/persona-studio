// 서버(라우트 핸들러)에서 "지금 요청을 보낸 사람이 누구인지"를 쿠키로 확인할 때 쓰는 Supabase 클라이언트.
// 서비스 롤 키는 쓰지 않으므로 RLS를 그대로 따른다 — app/auth/callback과 billing/mock 라우트가 "본인 확인" 용도로만 사용.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("클라우드 저장 기능이 아직 설정되지 않았습니다 (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 필요).");
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component에서 호출되면 쿠키를 못 쓴다 — 세션 갱신은 proxy.ts가 담당하므로 여기선 무시해도 됨
        }
      },
    },
  });
}
