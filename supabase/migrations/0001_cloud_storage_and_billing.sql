-- 클라우드 저장(유료 기능) + 구독 상태. Supabase SQL 편집기에서 그대로 실행하면 된다.
-- subscriptions를 먼저 만든다 — projects의 RLS 정책이 이 테이블을 참조하므로 순서가 중요하다.

-- subscriptions: 결제 상태. provider/provider_ref는 지금은 'mock'뿐이고, 실제 PG 연동 시 그대로 재사용한다.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'inactive' check (status in ('inactive', 'active', 'canceled')),
  provider text,
  provider_ref text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- 본인 상태 읽기만 허용 — insert/update/delete 정책이 아예 없어서, 서비스 롤 키(app/api/billing/mock/route.ts,
-- 나중엔 실제 PG 웹훅 핸들러)만 이 테이블을 바꿀 수 있다. 클라이언트가 자기 자신에게 구독을 부여할 수 없음.
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- projects: localStorage의 Project(JSON 전체)를 그대로 미러링한다.
-- 개별 필드(캐릭터/관계/이야기 등)를 쿼리하는 소비자가 없으므로 정규화하지 않는다 — data jsonb 통째로 저장.
create table if not exists public.projects (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

-- 소유자 + 활성 구독 둘 다 요구 — 클라이언트 UI 게이팅이 빠지거나 우회되어도 DB가 마지막 방어선이 되도록
create policy "projects_select_own_paid" on public.projects
  for select using (
    auth.uid() = user_id
    and exists (select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status = 'active')
  );
create policy "projects_insert_own_paid" on public.projects
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status = 'active')
  );
create policy "projects_update_own_paid" on public.projects
  for update using (
    auth.uid() = user_id
    and exists (select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status = 'active')
  ) with check (
    auth.uid() = user_id
    and exists (select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status = 'active')
  );
create policy "projects_delete_own_paid" on public.projects
  for delete using (
    auth.uid() = user_id
    and exists (select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status = 'active')
  );
