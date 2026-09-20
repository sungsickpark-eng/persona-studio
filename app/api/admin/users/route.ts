// 관리자 전용: 전체 사용자 요약 목록 (이메일·가입일·구독상태/플랜·이번달 AI 사용량·프로젝트 수).
// ponytail: Supabase auth.admin.listUsers는 기본 페이지당 최대 1000명 — 그 이상 넘어가면 페이지네이션을 붙일 것.
import { NextResponse } from "next/server";
import { isAdminEmail, requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MONTHLY_CALL_CAP } from "@/lib/pricing";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const client = createAdminClient();
  const [{ data: userList, error: usersErr }, { data: subs }, { data: projectRows }] = await Promise.all([
    client.auth.admin.listUsers({ perPage: 1000 }),
    client.from("subscriptions").select("user_id, status, plan, current_period_end"),
    client.from("projects").select("user_id"),
  ]);
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  const month = new Date().toISOString().slice(0, 7);
  const { data: usage } = await client.from("llm_usage").select("user_id, count").eq("month", month);

  const subByUser = new Map((subs ?? []).map((s) => [s.user_id, s]));
  const usageByUser = new Map((usage ?? []).map((u) => [u.user_id, u.count as number]));
  const projectCountByUser = new Map<string, number>();
  for (const row of projectRows ?? []) {
    projectCountByUser.set(row.user_id, (projectCountByUser.get(row.user_id) ?? 0) + 1);
  }

  const users = (userList?.users ?? []).map((u) => {
    const sub = subByUser.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "(이메일 없음)",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      status: sub?.status ?? "none",
      plan: sub?.plan ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      usageCount: usageByUser.get(u.id) ?? 0,
      usageCap: MONTHLY_CALL_CAP,
      projectCount: projectCountByUser.get(u.id) ?? 0,
      isAdmin: isAdminEmail(u.email),
    };
  });

  return NextResponse.json({ users });
}
