// 관리자 전용: 특정 사용자의 구독을 수동으로 바꾼다 (환불/지원 대응, PG 연동 전 임시 처리 등).
// subscriptions 테이블의 check 제약과 동일한 값만 허용 — 잘못된 값은 DB가 아니라 여기서 먼저 막는다.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/pricing";

type Status = "inactive" | "active" | "canceled";
const STATUSES: Status[] = ["inactive", "active", "canceled"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as { status?: Status; plan?: PlanId | null; currentPeriodEnd?: string | null };
  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (body.plan !== undefined && body.plan !== null && body.plan !== "monthly" && body.plan !== "yearly") {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  const client = createAdminClient();
  const { error } = await client.from("subscriptions").upsert({
    user_id: id,
    status: body.status,
    plan: body.plan ?? null,
    current_period_end: body.currentPeriodEnd ?? null,
    provider: "admin", // 관리자가 수동으로 바꿨다는 표시 — 'mock'과 구분해 나중에 감사 추적에 도움
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
