// 로그인한 사용자가 관리자인지만 알려준다. ADMIN_EMAILS는 서버 전용 환경변수라 클라이언트가 직접 판별할 수 없어서,
// 헤더에 "관리자" 메뉴를 조건부로 띄우려는 용도로만 씀 — 실제 데이터 접근 권한은 여전히 각 /api/admin/* 라우트의
// requireAdmin()이 막는다(lib/adminAuth.ts).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const admin = await requireAdmin();
  return NextResponse.json({ isAdmin: !!admin });
}
