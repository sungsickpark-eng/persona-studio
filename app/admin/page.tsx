// 서버 컴포넌트: 관리자가 아니면 화면 자체를 렌더링하지 않고 랜딩 페이지로 돌려보낸다.
// API 라우트(app/api/admin/**)의 requireAdmin() 체크와는 별개의 방어선 — 여기서 막히면 대시보드 코드/데이터가
// 클라이언트로 전혀 내려가지 않는다.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");
  return <AdminDashboard />;
}
