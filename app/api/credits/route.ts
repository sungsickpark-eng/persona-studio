// 로그인한 사용자의 보유 크레딧 잔액 조회 — app/pricing/page.tsx가 구매 후 잔액을 보여줄 때 쓴다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ balance: 0 });

  const { data } = await supabase.from("credit_balance").select("balance").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ balance: data?.balance ?? 0 });
}
