// 나이스페이 결제창 승인 콜백 — 나이스페이 서버가 결제 완료 후 이 주소로 폼 POST를 보낸다(브라우저 쿠키가 없으므로
// 로그인 확인은 returnUrl에 실어 보낸 Supabase 액세스 토큰으로 한다). 흐름: 서명 검증 → 나이스페이 최종 승인 API
// 호출(금액은 클라이언트가 아니라 서버가 lib/pricing.ts 기준으로 계산) → 구독 반영 → 결제창을 연 부모 창을
// /nicepay/success|fail로 이동시키는 HTML을 반환.
//
// ponytail: 여기서 반영하는 구독은 1회성 결제로 만료일만 늘리는 방식이다(기존 app/api/billing/mock/route.ts와 동일한
// 모양) — 나이스페이 "정기결제(빌링키)" API로 자동 갱신하게 하려면 카드 등록 + 매월 청구를 도는 별도 배치가 필요하니,
// 자동 갱신이 필요해지면 그때 추가할 것.
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/pricing";

function nicepayApiBase(): string {
  return process.env.NICEPAY_MODE === "production" ? "https://api.nicepay.co.kr" : "https://sandbox-api.nicepay.co.kr";
}

function nicepayBasicAuth(): string {
  const clientKey = process.env.NICEPAY_CLIENT_KEY ?? "";
  const secretKey = process.env.NICEPAY_SECRET_KEY ?? "";
  return Buffer.from(`${clientKey}:${secretKey}`).toString("base64");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Buffer.from(digest).toString("hex");
}

// 나이스페이 최종 승인 API 호출(서버 승인) — ediDate + signData 필요
async function nicepayConfirm(tid: string, amount: number): Promise<{ resultCode?: string; resultMsg?: string; amount?: number }> {
  const secretKey = process.env.NICEPAY_SECRET_KEY ?? "";
  const ediDate = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const signData = await sha256Hex(`${tid}${amount}${ediDate}${secretKey}`);

  const res = await fetch(`${nicepayApiBase()}/v1/payments/${tid}`, {
    method: "POST",
    headers: { Authorization: `Basic ${nicepayBasicAuth()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, ediDate, signData, returnCharSet: "utf-8" }),
  });
  return res.json();
}

// 결제 팝업(또는 리다이렉트 창)에서 부모 창을 url로 이동시키는 HTML — 팝업이 아니면 현재 창을 이동
function redirectHtml(url: string): string {
  const safeUrl = JSON.stringify(url);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><script>
(function(){
  var url=${safeUrl};
  try{
    if(window.opener&&!window.opener.closed){ window.opener.location.href=url; window.close(); return; }
  }catch(e){}
  window.location.replace(url);
})();
</script></body></html>`;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const planParam = url.searchParams.get("plan") ?? "";

  const form = await request.formData();
  const authResultCode = String(form.get("authResultCode") ?? "");
  const authResultMsg = String(form.get("authResultMsg") ?? "결제 실패");
  const tid = String(form.get("tid") ?? "");
  const authToken = String(form.get("authToken") ?? "");
  const signature = String(form.get("signature") ?? "");
  const formAmount = Number(form.get("amount") ?? 0) || 0;

  const fail = (code: string, msg: string) =>
    new NextResponse(redirectHtml(`/nicepay/fail?code=${encodeURIComponent(code)}&msg=${encodeURIComponent(msg)}`), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  if (authResultCode !== "0000") return fail(authResultCode, authResultMsg);

  if (signature) {
    const clientKey = process.env.NICEPAY_CLIENT_KEY ?? "";
    const secretKey = process.env.NICEPAY_SECRET_KEY ?? "";
    const expectedSig = await sha256Hex(`${authToken}${clientKey}${formAmount}${secretKey}`);
    if (signature !== expectedSig) return fail("SIG_ERR", "결제 서명 검증에 실패했습니다.");
  }

  if (planParam !== "monthly" && planParam !== "yearly") return fail("PLAN_ERR", "요금제 정보가 올바르지 않습니다.");
  const plan = planParam as PlanId;
  if (!token) return fail("AUTH_ERR", "로그인 정보가 없습니다.");

  const anonClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  const {
    data: { user },
  } = await anonClient.auth.getUser(token);
  if (!user) return fail("TOKEN_ERR", "로그인 정보가 만료되었습니다. 다시 로그인해 주세요.");

  // 결제 금액은 클라이언트 폼 값이 아니라 서버가 요금제 기준으로 계산한 값을 신뢰한다.
  const amount = PLANS[plan].priceKrw;

  const confirm = await nicepayConfirm(tid, amount);
  if (confirm.resultCode !== "0000") return fail(confirm.resultCode ?? "CONFIRM_ERR", confirm.resultMsg ?? "승인에 실패했습니다.");
  if (confirm.amount !== amount) return fail("AMOUNT_ERR", "결제 금액이 일치하지 않습니다.");

  const periodDays = plan === "yearly" ? 365 : 30;
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert({
    user_id: user.id,
    status: "active",
    plan,
    provider: "nicepay",
    provider_ref: tid,
    current_period_end: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return fail("DB_ERR", "구독 반영 중 오류가 발생했습니다.");

  return new NextResponse(redirectHtml("/nicepay/success?returnPath=/app"), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
