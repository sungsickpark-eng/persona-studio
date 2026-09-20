// 브라우저에서 쓰는 Supabase 클라이언트. AuthProvider와 lib/cloudSync.ts가 이것만 사용한다.
// Supabase 환경변수가 없으면(=클라우드 저장 기능 미설정) 여기서 던지므로, 호출부는 로그인 시도 시에만 불러야 한다 —
// 무료(비로그인) 사용자의 로컬 전용 흐름은 이 파일을 아예 import하지 않는 lib/store.ts만으로 계속 동작한다.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("클라우드 저장 기능이 아직 설정되지 않았습니다 (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 필요).");
  }
  return createBrowserClient(url, anonKey);
}
