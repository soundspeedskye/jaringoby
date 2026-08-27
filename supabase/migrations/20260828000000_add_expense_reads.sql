-- 안 읽은 지출 표시: 멤버가 지출 상세를 열면 읽음 행을 남긴다.
-- 게시글의 room_post_reads와 같은 모양이라, 클라이언트도 같은 방식으로 읽는다.

create table if not exists public.expense_reads (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default statement_timestamp(),
  primary key (expense_id, user_id)
);

create index if not exists expense_reads_user_expense_idx
  on public.expense_reads(user_id, expense_id);

alter table public.expense_reads enable row level security;
drop policy if exists expense_reads_read_own on public.expense_reads;
create policy expense_reads_read_own on public.expense_reads
for select to authenticated using (user_id = auth.uid());

create or replace function private.mark_expense_read_impl(p_expense_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  -- 개인 지출(period_id is null)은 방 피드에 뜨지 않으므로 읽음 대상이 아니다.
  select p.room_id into v_room_id
  from public.expenses e
  join public.periods p on p.id = e.period_id
  where e.id = p_expense_id and e.deleted_at is null;

  if v_room_id is null or not private.is_room_member(v_room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'room membership required';
  end if;

  -- 최초로 연 시각을 보존한다(다시 열어도 read_at은 그대로).
  insert into public.expense_reads(expense_id, user_id) values (p_expense_id, v_user_id)
  on conflict (expense_id, user_id) do update set read_at = expense_reads.read_at;
end;
$$;

create or replace function public.mark_expense_read(p_expense_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.mark_expense_read_impl(p_expense_id); $$;

revoke all on function public.mark_expense_read(uuid) from public, anon, service_role;
grant execute on function public.mark_expense_read(uuid) to authenticated;
grant select on public.expense_reads to authenticated;

-- 읽음 상태도 실시간으로 따라오게 한다(다른 기기에서 읽으면 이 기기의 NEW도 사라진다).
do $realtime_setup$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'expense_reads'
     ) then
    alter publication supabase_realtime add table public.expense_reads;
  end if;
end
$realtime_setup$;
