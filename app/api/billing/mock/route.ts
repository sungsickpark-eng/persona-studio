// 목업 결제 — 실제 PG(토스페이먼츠 등)를 아직 계약하지 않아, 구독 상태만 테스트로 켜고 끌 수 있게 한다.
// 반드시 서버에서, 서비스 롤 키로만 subscriptions를 바꾼다: RLS가 클라이언트에는 읽기 권한만 주므로
// 사용자가 자기 자신에게 직접 유료 구독을 부여할 수 없다. 나중에 진짜 PG로 바꿀 때도 이 라우트처럼
// "서버가 본인 확인 후 서비스 롤로 upsert"하는 모양을 그대로 재사용하면 된다(트리거만 웹훅으로 교체).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/pricing";

export async function POST(request: Request) {
  const { action, plan } = (await request.json()) as { action?: "activate" | "deactivate"; plan?: PlanId };
  if (action !== "activate" && action !== "deactivate") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  if (action === "activate" && plan !== "monthly" && plan !== "yearly") {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const periodDays = plan === "yearly" ? 365 : 30;
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert({
    user_id: user.id,
    status: action === "activate" ? "active" : "inactive",
    plan: action === "activate" ? plan : null,
    provider: action === "activate" ? "mock" : null,
    provider_ref: null,
    current_period_end: action === "activate" ? new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: action === "activate" ? "active" : "inactive", plan: action === "activate" ? plan : null });
}
