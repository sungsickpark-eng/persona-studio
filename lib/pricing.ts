// 구독 가격. 실사용 데이터 나오면 이 값만 바꾸면 된다 — app/pricing/page.tsx, components/AuthBadge.tsx가 이걸 그대로 씀.
// 근거: Supabase Pro($25/월 고정) 기준 DB 한계비용은 사용자당 월 100원 미만이라 가격 결정에 큰 영향 없음.
// 반대로 LLM은 진짜 변동비라 — 포함되는 건 GPT-4o-mini/Gemini Flash급 기본 사용량뿐이고, Claude Sonnet 등 고급 모델은
// 지금처럼 사용자 본인 API 키로만 쓸 수 있다(구독에 포함 안 됨).
export type PlanId = "monthly" | "yearly";

export type Plan = {
  id: PlanId;
  label: string;
  priceKrw: number; // 결제 단위 금액
  periodLabel: string;
  note?: string; // 연간 할인 등 부가 설명
};

export const PLANS: Record<PlanId, Plan> = {
  monthly: { id: "monthly", label: "월간 구독", priceKrw: 9900, periodLabel: "/ 월" },
  yearly: { id: "yearly", label: "연간 구독", priceKrw: 99000, periodLabel: "/ 년", note: "월 8,250원 · 2개월치 할인" },
};

// 포함 AI 사용량 상한 — GPT-4o-mini 기준 500회/월 비용은 ~$0.6이라 월 9,900원 요금제에서 넉넉한 마진.
// 초과분은 막되(app/api/chat, app/api/story), 본인 API 키를 연결하면 그쪽은 무제한으로 계속 쓸 수 있다.
export const MONTHLY_CALL_CAP = 500;

export const PLAN_FEATURES = [
  "프로젝트를 Supabase 클라우드에 자동 백업 (기기 바꿔도 로그인만 하면 이어서)",
  `GPT-4o-mini · Gemini Flash 기본 AI 사용량 월 ${MONTHLY_CALL_CAP}회 포함(둘 중 골라 사용) — API 키 직접 발급 없이 캐릭터 인터뷰·이야기 생성`,
  "Claude 등 고급 모델이나 포함 사용량 초과분은 지금처럼 본인 API 키 연결 시 계속 사용 가능",
];
