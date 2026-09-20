-- 구독 페이지에서 월간/연간을 고를 수 있게, 어떤 주기로 구독했는지 기록한다.
alter table public.subscriptions
  add column if not exists plan text check (plan in ('monthly', 'yearly'));
