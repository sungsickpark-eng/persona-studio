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
import { CREDIT_PACKS, PLANS, PLAN_FEATURES, PROMO_LABEL, PROMO_PERCENT_OFF, type CreditPackId, type PlanId } from "@/lib/pricing";
import ThemeToggle from "@/components/ThemeToggle";

const NICEPAY_CLIENT_KEY = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY;

export default function PricingPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle, signInWithKakao } = useAuth();
  const { status, plan: currentPlan, creditBalance, refreshCredits, activateMockSubscription } = useSubscription();
  const [selected, setSelected] = useState<PlanId>("monthly");
  const [busy, setBusy] = useState(false);
  const [creditBusy, setCreditBusy] = useState<CreditPackId | null>(null);

  const payWithNicePay = async (orderId: string, amount: number, goodsName: string, returnUrl: string) => {
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

    requestNicePay({
      clientId: NICEPAY_CLIENT_KEY!,
      method: "card",
      orderId,
      amount,
      goodsName,
      returnUrl: `${returnUrl}&token=${encodeURIComponent(session.access_token)}`,
      fnError: (result) => alert("결제 오류: " + (result.resultMsg || "알 수 없는 오류")),
    });
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      if (NICEPAY_CLIENT_KEY) {
        await payWithNicePay(
          `sub_${selected}_${Date.now()}`,
          PLANS[selected].priceKrw,
          PLANS[selected].label,
          `${location.origin}/api/nicepay/auth?plan=${selected}`,
        );
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

  const buyCredits = async (pack: CreditPackId) => {
    setCreditBusy(pack);
    try {
      if (NICEPAY_CLIENT_KEY) {
        const orderId = `credits_${pack}_${crypto.randomUUID()}`;
        await payWithNicePay(
          orderId,
          CREDIT_PACKS[pack].priceKrw,
          `크레딧 ${CREDIT_PACKS[pack].label}`,
          `${location.origin}/api/nicepay/auth?kind=credits&pack=${pack}`,
        );
      } else {
        const res = await fetch("/api/billing/mock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "buyCredits", pack }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "구매에 실패했습니다.");
        await refreshCredits();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCreditBusy(null);
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

      <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-fuchsia-100 px-3 py-1.5 text-xs font-semibold text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
        🎉 {PROMO_LABEL}
      </div>

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
              <span className="text-base text-gray-400 line-through">{PLANS[selected].listPriceKrw.toLocaleString("ko-KR")}원</span>
              <span className="rounded bg-fuchsia-600 px-1.5 py-0.5 text-xs font-bold text-white">{PROMO_PERCENT_OFF}% 할인</span>
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

      <div id="credits" className="studio-panel mt-6 scroll-mt-6">
        <h2 className="text-sm font-bold">크레딧 추가 구매</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          월 포함 AI 사용량을 다 썼을 때, 다음 달까지 기다리지 않고 바로 이어서 쓸 수 있습니다. 구매한 크레딧은 이월되며 한 번
          사용에 1크레딧이 듭니다.
          {status === "active" && creditBalance !== null && (
            <>
              {" "}
              현재 보유: <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">{creditBalance.toLocaleString("ko-KR")}개</span>
            </>
          )}
          {status !== "active" && " 구독자 전용 추가 상품이라, 먼저 위 요금제를 구독해야 구매할 수 있습니다."}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {Object.values(CREDIT_PACKS).map((pack) => (
            <div key={pack.id} className="rounded-md border border-gray-200 p-3 text-center dark:border-gray-800">
              <p className="text-sm font-semibold">{pack.label}</p>
              <p className="mt-1 text-xs text-gray-400 line-through">{pack.listPriceKrw.toLocaleString("ko-KR")}원</p>
              <p className="studio-serif text-lg font-bold text-fuchsia-600 dark:text-fuchsia-400">{pack.priceKrw.toLocaleString("ko-KR")}원</p>
              <button
                onClick={() => buyCredits(pack.id)}
                disabled={status !== "active" || creditBusy !== null}
                title={status !== "active" ? "구독 후 구매할 수 있습니다" : undefined}
                className="mt-2 w-full rounded-md border border-fuchsia-300 px-2 py-1.5 text-xs font-medium text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:opacity-40 dark:border-fuchsia-700 dark:text-fuchsia-300 dark:hover:bg-fuchsia-950/30"
              >
                {creditBusy === pack.id ? "처리 중…" : "구매"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <style>{`.studio-serif { font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif; letter-spacing: -0.01em; } .studio-panel { border: 1px solid rgba(120, 113, 130, 0.18); border-radius: 12px; padding: 24px; background: color-mix(in srgb, currentColor 3%, transparent); }`}</style>
    </main>
  );
}
