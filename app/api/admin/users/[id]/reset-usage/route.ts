// 관리자 전용: 이번 달 포함 AI 사용량 카운트를 0으로 초기화 (지원 문의 대응용 — 과금 남용 방지 상한을 관리자가 풀어줌).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const month = new Date().toISOString().slice(0, 7);
  const client = createAdminClient();
  const { error } = await client.from("llm_usage").upsert({ user_id: id, month, count: 0 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
