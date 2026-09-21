// 구독 가격. 실사용 데이터 나오면 이 값만 바꾸면 된다 — app/pricing/page.tsx, components/AuthBadge.tsx가 이걸 그대로 씀.
// 근거: Supabase Pro($25/월 고정) 기준 DB 한계비용은 사용자당 월 100원 미만이라 가격 결정에 큰 영향 없음.
// 반대로 LLM은 진짜 변동비라 — 포함되는 건 GPT-4o-mini/Gemini Flash급 기본 사용량뿐이고, Claude Sonnet 등 고급 모델은
// 지금처럼 사용자 본인 API 키로만 쓸 수 있다(구독에 포함 안 됨).
export type PlanId = "monthly" | "yearly";

export type Plan = {
  id: PlanId;
  label: string;
  listPriceKrw: number; // 정가 — 프로모션 종료 후 되돌아갈 기준 금액
  priceKrw: number; // 실제 결제 금액(프로모션 할인 적용됨). 서버(app/api/nicepay/auth)도 이 값을 그대로 신뢰한다.
  periodLabel: string;
  note?: string; // 연간 할인 등 부가 설명
};

// 런칭 프로모션 — 정가는 그대로 두고 결제 금액만 할인한다. 끝나면 이 두 상수만 지우면 정가로 돌아간다.
export const PROMO_PERCENT_OFF = 50;
export const PROMO_LABEL = "런칭 프로모션 50% 할인 중";

function promoPrice(listPriceKrw: number): number {
  return Math.round((listPriceKrw * (100 - PROMO_PERCENT_OFF)) / 100);
}

const PLAN_LIST_PRICES: Record<PlanId, number> = { monthly: 9900, yearly: 99000 };

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    label: "월간 구독",
    listPriceKrw: PLAN_LIST_PRICES.monthly,
    priceKrw: promoPrice(PLAN_LIST_PRICES.monthly),
    periodLabel: "/ 월",
  },
  yearly: {
    id: "yearly",
    label: "연간 구독",
    listPriceKrw: PLAN_LIST_PRICES.yearly,
    priceKrw: promoPrice(PLAN_LIST_PRICES.yearly),
    periodLabel: "/ 년",
    note: `월 ${Math.round(promoPrice(PLAN_LIST_PRICES.yearly) / 12).toLocaleString("ko-KR")}원 · 2개월치 할인`,
  },
};

// 포함 AI 사용량 상한 — GPT-4o-mini 기준 500회/월 비용은 ~$0.6이라 월 9,900원(정가 기준) 요금제에서 넉넉한 마진.
// 초과분은 막되(app/api/chat, app/api/story), 크레딧을 추가 구매했거나 본인 API 키를 연결하면 계속 쓸 수 있다.
export const MONTHLY_CALL_CAP = 500;

export const PLAN_FEATURES = [
  "프로젝트를 Supabase 클라우드에 자동 백업 (기기 바꿔도 로그인만 하면 이어서)",
  `GPT-4o-mini · Gemini Flash 기본 AI 사용량 월 ${MONTHLY_CALL_CAP}회 포함(둘 중 골라 사용) — API 키 직접 발급 없이 캐릭터 인터뷰·이야기 생성`,
  "월 사용량을 다 썼다면 크레딧을 추가 구매해 이어서 사용 가능(아래 참고)",
  "Claude 등 고급 모델이나 포함 사용량 초과분은 지금처럼 본인 API 키 연결 시 계속 사용 가능",
];

// 구독자가 월 상한을 넘겼을 때 추가로 살 수 있는 포함 AI 사용량. 구매한 크레딧은 월별로 초기화되지 않고
// 다 쓸 때까지 이월된다(lib/includedLlm.ts가 상한 초과 시 이 잔액을 대신 차감).
export type CreditPackId = "credits_small" | "credits_medium" | "credits_large";

export type CreditPack = {
  id: CreditPackId;
  label: string;
  credits: number;
  listPriceKrw: number;
  priceKrw: number;
};

const CREDIT_PACK_BASE: Record<CreditPackId, { label: string; credits: number; listPriceKrw: number }> = {
  credits_small: { label: "200회", credits: 200, listPriceKrw: 4900 },
  credits_medium: { label: "500회", credits: 500, listPriceKrw: 9900 },
  credits_large: { label: "1,500회", credits: 1500, listPriceKrw: 24900 },
};

export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = Object.fromEntries(
  (Object.keys(CREDIT_PACK_BASE) as CreditPackId[]).map((id) => {
    const base = CREDIT_PACK_BASE[id];
    return [id, { id, label: base.label, credits: base.credits, listPriceKrw: base.listPriceKrw, priceKrw: promoPrice(base.listPriceKrw) }];
  }),
) as Record<CreditPackId, CreditPack>;
