// 서버 컴포넌트: 관리자가 아니면 화면 자체를 렌더링하지 않고 랜딩 페이지로 돌려보낸다.
// API 라우트(app/api/admin/**)의 requireAdmin() 체크와는 별개의 방어선 — 여기서 막히면 대시보드 코드/데이터가
// 클라이언트로 전혀 내려가지 않는다.
// dynamic="force-dynamic": 매 요청마다 세션을 확인해야 하는 페이지라 정적 생성 대상이 될 수 없다 — 이게 없으면
// 빌드가 이 페이지를 미리 렌더링하려다 requireAdmin()이 부르는 Supabase 클라이언트가 환경변수 없이 만들어져
// (빌드 환경엔 아직 NEXT_PUBLIC_SUPABASE_URL 등이 없을 수 있음) 에러를 던지고, 그러면 전체 빌드가 실패한다.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");
  return <AdminDashboard />;
}
