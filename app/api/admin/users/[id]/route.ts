// 관리자 전용: 사용자 한 명의 상세 — 구독 전체 필드, 이번 달 사용량, 보유 프로젝트 목록(이름·수정시각만, 내용은 안 줌).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const client = createAdminClient();
  const [{ data: user, error: userErr }, { data: sub }, { data: projects }] = await Promise.all([
    client.auth.admin.getUserById(id),
    client.from("subscriptions").select("*").eq("user_id", id).maybeSingle(),
    client.from("projects").select("id, name, updated_at").eq("user_id", id).order("updated_at", { ascending: false }),
  ]);
  if (userErr || !user?.user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const month = new Date().toISOString().slice(0, 7);
  const { data: usage } = await client.from("llm_usage").select("count").eq("user_id", id).eq("month", month).maybeSingle();

  return NextResponse.json({
    id: user.user.id,
    email: user.user.email,
    createdAt: user.user.created_at,
    lastSignInAt: user.user.last_sign_in_at ?? null,
    subscription: sub ?? null,
    usageCount: usage?.count ?? 0,
    projects: projects ?? [],
  });
}
