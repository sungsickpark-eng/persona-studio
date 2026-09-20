"use client";
// 구독(클라우드 저장 + 기본 AI 사용량) 요금제 페이지. 로그인 안 된 상태면 먼저 로그인부터 시키고,
// 로그인 후에는 월간/연간을 골라 결제한다. NEXT_PUBLIC_NICEPAY_CLIENT_KEY가 설정돼 있으면 나이스페이로 실결제하고
// (app/api/nicepay/auth/route.ts가 서버 승인 후 구독을 반영), 아니면 지금처럼 목업 결제로 대체한다
// (app/api/billing/mock/route.ts — 나이스페이 키 없이도 로컬 개발이 막히지 않게 하려는 용도).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSubscription } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { loadNicePay, requestNicePay } from "@/lib/nicepay";
import { PLANS, PLAN_FEATURES, type PlanId } from "@/lib/pricing";
import ThemeToggle from "@/components/ThemeToggle";

const NICEPAY_CLIENT_KEY = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY;

export default function PricingPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle, signInWithKakao } = useAuth();
  const { status, plan: currentPlan, activateMockSubscription } = useSubscription();
  const [selected, setSelected] = useState<PlanId>("monthly");
  const [busy, setBusy] = useState(false);

  const payWithNicePay = async (plan: PlanId) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요합니다.");

    try {
      await loadNicePay();
    } catch {
      throw new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    const returnUrl = `${location.origin}/api/nicepay/auth?token=${encodeURIComponent(session.access_token)}&plan=${plan}`;
    requestNicePay({
      clientId: NICEPAY_CLIENT_KEY!,
      method: "card",
      orderId: `sub_${plan}_${Date.now()}`,
      amount: PLANS[plan].priceKrw,
      goodsName: PLANS[plan].label,
      returnUrl,
      fnError: (result) => alert("결제 오류: " + (result.resultMsg || "알 수 없는 오류")),
    });
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      if (NICEPAY_CLIENT_KEY) {
        await payWithNicePay(selected);
      } else {
        await activateMockSubscription("activate", selected);
        router.push("/app");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-8 sm:py-16">
      <header className="mb-10 flex items-start justify-between gap-3">
        <div>
          <Link href="/app" className="text-xs text-gray-400 transition hover:text-fuchsia-600 dark:hover:text-fuchsia-400">
            ← 프로젝트 목록
          </Link>
          <h1 className="studio-serif mt-1 text-3xl font-bold sm:text-4xl">구독 · 요금제</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            무료로도 지금처럼 로컬 저장·로컬 Ollama는 계속 쓸 수 있습니다. 아래는 클라우드 저장이 필요할 때만 선택하는 유료 기능입니다.
          </p>
        </div>
        <ThemeToggle className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1.5 text-sm transition hover:border-fuchsia-400 dark:border-gray-800" />
      </header>

      {status === "active" ? (
        <div className="studio-panel">
          <p className="text-sm">
            이미 <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">{currentPlan && PLANS[currentPlan].label}</span> 중입니다.
          </p>
          <Link href="/app" className="mt-3 inline-block text-sm text-fuchsia-600 hover:underline dark:text-fuchsia-400">
            프로젝트 목록으로 가기 →
          </Link>
        </div>
      ) : (
        <>
          <div className="studio-panel">
            <div className="mb-4 flex gap-1.5 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
              {(Object.values(PLANS)).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                    selected === p.id
                      ? "bg-white text-fuchsia-600 shadow dark:bg-gray-950 dark:text-fuchsia-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="studio-serif text-4xl font-bold">{PLANS[selected].priceKrw.toLocaleString("ko-KR")}원</span>
              <span className="text-sm text-gray-400">{PLANS[selected].periodLabel}</span>
            </div>
            {PLANS[selected].note && <p className="mt-1 text-xs text-fuchsia-600 dark:text-fuchsia-400">{PLANS[selected].note}</p>}

            <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-fuchsia-500">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {!authLoading && !user ? (
              <div className="mt-6 space-y-2">
                <p className="text-xs text-gray-400">구독하려면 먼저 로그인이 필요합니다.</p>
                <div className="flex gap-2">
                  <button
                    onClick={signInWithGoogle}
                    className="flex-1 rounded-md border border-gray-200 px-3 py-2.5 text-sm transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    Google로 계속하기
                  </button>
                  <button
                    onClick={signInWithKakao}
                    className="flex-1 rounded-md border border-gray-200 px-3 py-2.5 text-sm transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    Kakao로 계속하기
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={subscribe}
                disabled={busy || authLoading}
                className="mt-6 w-full rounded-md bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:opacity-40"
              >
                {busy ? "처리 중…" : `${PLANS[selected].label} 시작하기`}
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            {NICEPAY_CLIENT_KEY
              ? "나이스페이로 결제가 진행됩니다."
              : "결제 대행사(PG) 연동 전까지는 테스트 목적의 목업 결제입니다 — 실제 카드 청구는 발생하지 않습니다."}
          </p>
        </>
      )}

      <style>{`.studio-serif { font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif; letter-spacing: -0.01em; } .studio-panel { border: 1px solid rgba(120, 113, 130, 0.18); border-radius: 12px; padding: 24px; background: color-mix(in srgb, currentColor 3%, transparent); }`}</style>
    </main>
  );
}
