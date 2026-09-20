-- 구독자에게 포함된 기본 AI 사용량(서버가 자기 키로 대신 호출)을 월별로 세는 테이블 + 원자적 증가 함수.
create table if not exists public.llm_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  count integer not null default 0,
  primary key (user_id, month)
);

alter table public.llm_usage enable row level security;

-- 본인 사용량 조회만 허용 — insert/update 정책이 없어서, 서비스 롤(increment_llm_usage를 호출하는 서버 라우트)만 바꿀 수 있다.
create policy "llm_usage_select_own" on public.llm_usage
  for select using (auth.uid() = user_id);

-- 카운트를 원자적으로 올리고, 상한을 넘으면 방금 올린 걸 다시 깎은 뒤 allowed=false를 돌려준다.
-- 동시에 여러 요청이 들어와도 upsert 자체가 원자적이라 카운터가 상한을 크게 초과해 새는 일이 없다.
create or replace function public.increment_llm_usage(p_user_id uuid, p_month text, p_cap int)
returns table(allowed boolean, count int)
language plpgsql
as $$
declare
  v_count int;
begin
  insert into public.llm_usage (user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month) do update set count = public.llm_usage.count + 1
  returning public.llm_usage.count into v_count;

  if v_count > p_cap then
    update public.llm_usage set count = count - 1 where user_id = p_user_id and month = p_month;
    return query select false, p_cap;
  end if;

  return query select true, v_count;
end;
$$;
