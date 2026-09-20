// 구독자 전용 "포함 AI"(provider === "included") 처리 — 사용자가 설정에서 직접 고르는 옵션이라, 조건을 못 채우면
// 조용히 다른 provider로 넘기는 대신 바로 이유를 알려준다. 로그인·구독·월별 사용량 상한을 확인한 뒤, 통과하면
// includedProvider(openai/gemini)에 맞는 서버 보유 키로 바꿔서 돌려준다 — 실제 호출은 lib/llm.ts의 기존 openai/gemini
// 분기가 그대로 처리한다. Claude는 단가가 비싸 포함 대상이 아니다(lib/pricing.ts 참고) — 쓰려면 본인 키가 필요.
// 이 파일은 서버 API 라우트에서만 import할 것.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MONTHLY_CALL_CAP } from "@/lib/pricing";
import { DEFAULT_LLM_SETTINGS, type IncludedProvider, type LLMSettings } from "@/lib/store";

const INCLUDED_KEYS: Record<IncludedProvider, { key: string | undefined; model: string }> = {
  openai: { key: process.env.INCLUDED_OPENAI_API_KEY, model: process.env.INCLUDED_OPENAI_MODEL ?? "gpt-4o-mini" },
  gemini: { key: process.env.INCLUDED_GEMINI_API_KEY, model: process.env.INCLUDED_GEMINI_MODEL ?? "gemini-3.5-flash" },
};

export async function withIncludedUsage(llm: LLMSettings | undefined): Promise<LLMSettings | undefined> {
  const settings = llm ?? DEFAULT_LLM_SETTINGS;
  if (settings.provider !== "included") return llm; // 다른 provider면 손대지 않는다

  const included = INCLUDED_KEYS[settings.includedProvider];
  if (!included.key) throw new Error("포함 AI 사용량이 아직 설정되지 않았습니다. 설정에서 다른 연결 방법을 선택하세요.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("포함 AI 사용량은 로그인 후 구독자만 쓸 수 있습니다.");

  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
  if (sub?.status !== "active") throw new Error("포함 AI 사용량은 구독자만 쓸 수 있습니다. 설정에서 구독하거나 다른 연결 방법을 선택하세요.");

  const month = new Date().toISOString().slice(0, 7); // "2026-09"
  // 사용량 상한은 openai/gemini 구분 없이 합산 — 모델별로 따로 세지 않는다
  const { data, error } = await admin.rpc("increment_llm_usage", { p_user_id: user.id, p_month: month, p_cap: MONTHLY_CALL_CAP });
  if (error) throw new Error("포함 AI 사용량 확인 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
  if (!data?.[0]?.allowed) {
    throw new Error(`이번 달 포함 AI 사용량(${MONTHLY_CALL_CAP}회)을 다 쓰셨습니다. 설정에서 본인 API 키를 연결하면 계속 쓸 수 있습니다.`);
  }

  if (settings.includedProvider === "gemini") {
    return { ...settings, provider: "gemini", geminiKey: included.key, geminiModel: included.model };
  }
  return { ...settings, provider: "openai", openaiKey: included.key, openaiModel: included.model };
}
