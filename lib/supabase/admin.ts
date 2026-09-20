// 서비스 롤 키로 RLS를 우회하는 관리자 클라이언트. 서버 전용 라우트(app/api/billing/mock, app/api/nicepay/auth,
// app/api/admin/**)에서만 import할 것 —
// SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사가 없어 브라우저 번들에는 애초에 값이 안 실리지만,
// 그래도 이 파일을 클라이언트 컴포넌트에서 import하지 않도록 주의한다.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("클라우드 저장 기능이 아직 설정되지 않았습니다 (SUPABASE_SERVICE_ROLE_KEY 필요).");
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
