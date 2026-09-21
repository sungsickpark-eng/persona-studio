-- 구독자가 월 포함 AI 사용량 상한을 넘겼을 때 추가로 살 수 있는 크레딧(lib/pricing.ts의 CREDIT_PACKS) 잔액.
-- llm_usage(월별 카운터)와 달리 이 잔액은 월이 바뀌어도 초기화되지 않고, 다 쓸 때까지 이월된다.
create table if not exists public.credit_balance (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.credit_balance enable row level security;

-- 본인 잔액 조회만 허용 — insert/update 정책이 없어서 서비스 롤(아래 두 함수를 호출하는 서버 라우트)만 바꿀 수 있다.
create policy "credit_balance_select_own" on public.credit_balance
  for select using (auth.uid() = user_id);

-- 결제 승인 후 크레딧을 더한다. app/api/nicepay/auth, app/api/billing/mock이 서비스 롤로만 호출한다.
create or replace function public.add_credits(p_user_id uuid, p_amount int)
returns void
language plpgsql
as $$
begin
  insert into public.credit_balance (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id) do update set balance = public.credit_balance.balance + p_amount, updated_at = now();
end;
$$;

-- 월 상한을 넘긴 요청 한 번에 크레딧 1개를 원자적으로 차감한다. 잔액이 없으면 false — 호출부(lib/includedLlm.ts)가
-- 그때 "크레딧을 추가 구매하거나 본인 API 키를 연결하라"는 안내로 막는다.
create or replace function public.consume_credit(p_user_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_updated int;
begin
  update public.credit_balance set balance = balance - 1, updated_at = now()
  where user_id = p_user_id and balance > 0;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- increment_llm_usage와 같은 이유로(0004 참고) 실행 권한을 서비스 롤에만 남긴다.
revoke execute on function public.add_credits(uuid, int) from public, anon, authenticated;
revoke execute on function public.consume_credit(uuid) from public, anon, authenticated;
