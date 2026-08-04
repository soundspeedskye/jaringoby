-- 지출 "예외" 만장일치 승인
--
-- A member may flag a period expense as an exception (기념일·야근 등 불가피한
-- 사회생활) with a short reason at creation time. The expense counts toward the
-- budget as usual until *every* active period member approves it. If the full
-- set has approved on or before the adjustment cutoff C (correction_ends_at),
-- settlement excludes the expense; otherwise it settles like any other.
--
-- Exclusion stays computed at finalize (source of truth), so membership changes
-- during the week resolve automatically. finalize_period_core is replaced below
-- to set excluded_at on qualifying expenses just before it sums member spend.

--------------------------------------------------------------------------------
-- Tables
--------------------------------------------------------------------------------

create table public.expense_exceptions (
  expense_id uuid primary key references public.expenses (id) on delete cascade,
  reason text not null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  requested_at timestamptz not null default now(),
  constraint expense_exceptions_reason_length
    check (char_length(reason) between 1 and 10)
);

create index expense_exceptions_requester_idx
  on public.expense_exceptions (requested_by);

create table public.expense_exception_approvals (
  expense_id uuid not null references public.expense_exceptions (expense_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (expense_id, user_id)
);

create index expense_exception_approvals_user_idx
  on public.expense_exception_approvals (user_id);

--------------------------------------------------------------------------------
-- Row level security: room members read, all writes go through the RPCs below
--------------------------------------------------------------------------------

alter table public.expense_exceptions enable row level security;
alter table public.expense_exception_approvals enable row level security;

create policy expense_exceptions_read_room_members
on public.expense_exceptions
for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_exceptions.expense_id
      and e.period_id is not null
      and private.is_period_room_member(e.period_id, (select auth.uid()))
  )
);

create policy expense_exception_approvals_read_room_members
on public.expense_exception_approvals
for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_exception_approvals.expense_id
      and e.period_id is not null
      and private.is_period_room_member(e.period_id, (select auth.uid()))
  )
);

--------------------------------------------------------------------------------
-- Expense creation with an optional exception (9-arg add_expense overload)
--
-- Reuses the point-aware insert impl for the expense itself, then records the
-- exception and auto-approves it on behalf of the requester. Idempotent: the
-- underlying insert dedupes on client_request_id and both inserts use
-- on conflict do nothing, so retries are safe.
--------------------------------------------------------------------------------

create function private.add_expense_with_exception_impl(
  p_period_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_client_request_id uuid,
  p_point_amount bigint,
  p_exception_reason text
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses%rowtype;
  v_reason text := nullif(btrim(coalesce(p_exception_reason, '')), '');
begin
  v_expense := private.add_expense_with_point_amount_impl(
    p_period_id, p_amount, p_category, p_occurred_at,
    p_memo, p_photo_path, p_client_request_id, p_point_amount
  );

  if v_reason is null then
    return v_expense;
  end if;

  if v_expense.period_id is null then
    raise exception using errcode = '22023', message = 'exceptions apply only to period expenses';
  end if;
  if char_length(v_reason) > 10 then
    raise exception using errcode = '22023', message = 'exception reason must be at most 10 characters';
  end if;

  insert into public.expense_exceptions (expense_id, reason, requested_by)
  values (v_expense.id, v_reason, v_expense.user_id)
  on conflict (expense_id) do nothing;

  insert into public.expense_exception_approvals (expense_id, user_id)
  values (v_expense.id, v_expense.user_id)
  on conflict (expense_id, user_id) do nothing;

  return v_expense;
end;
$$;

create function public.add_expense(
  p_period_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_client_request_id uuid,
  p_point_amount bigint,
  p_exception_reason text
)
returns public.expenses
language sql
security invoker
set search_path = ''
as $$
  select private.add_expense_with_exception_impl(
    p_period_id, p_amount, p_category, p_occurred_at,
    p_memo, p_photo_path, p_client_request_id, p_point_amount, p_exception_reason
  );
$$;

--------------------------------------------------------------------------------
-- Approve / un-approve / withdraw
--------------------------------------------------------------------------------

create function private.approve_expense_exception_impl(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = p_expense_id;
  if v_expense.id is null or v_expense.period_id is null then
    raise exception using errcode = '22023', message = 'expense not found';
  end if;
  if not exists (
    select 1 from public.expense_exceptions x where x.expense_id = p_expense_id
  ) then
    raise exception using errcode = '22023', message = 'no exception to approve';
  end if;

  select p.* into v_period
  from public.periods p
  where p.id = v_expense.period_id;
  if statement_timestamp() >= v_period.correction_ends_at then
    raise exception using errcode = '22023', message = 'exception approval deadline has passed';
  end if;
  if not private.is_active_period_member(v_expense.period_id, v_user_id) then
    raise exception using errcode = '42501', message = 'an active period membership is required';
  end if;

  insert into public.expense_exception_approvals (expense_id, user_id)
  values (p_expense_id, v_user_id)
  on conflict (expense_id, user_id) do nothing;
end;
$$;

create function private.remove_expense_exception_approval_impl(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = p_expense_id;
  if v_expense.id is null or v_expense.period_id is null then
    raise exception using errcode = '22023', message = 'expense not found';
  end if;

  select p.* into v_period
  from public.periods p
  where p.id = v_expense.period_id;
  if statement_timestamp() >= v_period.correction_ends_at then
    raise exception using errcode = '22023', message = 'exception approval deadline has passed';
  end if;

  delete from public.expense_exception_approvals
  where expense_id = p_expense_id
    and user_id = v_user_id;
end;
$$;

-- Owner-only: cancel the exception entirely (removes it and every approval).
create function private.withdraw_expense_exception_impl(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = p_expense_id;
  if v_expense.id is null then
    raise exception using errcode = '22023', message = 'expense not found';
  end if;
  if v_expense.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the requester can withdraw the exception';
  end if;

  select p.* into v_period
  from public.periods p
  where p.id = v_expense.period_id;
  if v_period.id is not null and statement_timestamp() >= v_period.correction_ends_at then
    raise exception using errcode = '22023', message = 'exception approval deadline has passed';
  end if;

  delete from public.expense_exceptions where expense_id = p_expense_id;
end;
$$;

create function public.approve_expense_exception(p_expense_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.approve_expense_exception_impl(p_expense_id);
$$;

create function public.remove_expense_exception_approval(p_expense_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_expense_exception_approval_impl(p_expense_id);
$$;

create function public.withdraw_expense_exception(p_expense_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.withdraw_expense_exception_impl(p_expense_id);
$$;

--------------------------------------------------------------------------------
-- Settlement: exclude expenses whose exception is unanimously approved by C
--
-- Replaces finalize_period_core (originally in 20260722120000). The only change
-- is the pre-step that stamps excluded_at/exclusion_reason before member_spend
-- is summed; the sum already skips excluded rows.
--------------------------------------------------------------------------------

create or replace function private.finalize_period_core(p_period_id uuid)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.periods%rowtype;
begin
  select p.* into v_period
  from public.periods p
  where p.id = p_period_id
  for update;
  if v_period.id is null then
    raise exception using errcode = '22023', message = 'period not found';
  end if;

  if v_period.finalized_at is not null
     or exists (
       select 1 from public.period_results r where r.period_id = p_period_id
     ) then
    return v_period;
  end if;

  if statement_timestamp() < v_period.finalizes_at then
    raise exception using errcode = '22023', message = 'period cannot be finalized before F';
  end if;

  -- Exception pre-step: an expense drops out of settlement when it carries an
  -- exception and every active period member has approved it on or before C.
  update public.expenses e
  set excluded_at = v_period.correction_ends_at,
      exclusion_reason = x.reason
  from public.expense_exceptions x
  where x.expense_id = e.id
    and e.period_id = p_period_id
    and e.deleted_at is null
    and e.excluded_at is null
    and (
      select count(*)
      from public.period_members pm
      where pm.period_id = p_period_id
        and pm.status = 'active'
    ) = (
      select count(*)
      from public.expense_exception_approvals a
      join public.period_members pm2
        on pm2.period_id = p_period_id
       and pm2.user_id = a.user_id
       and pm2.status = 'active'
      where a.expense_id = e.id
        and a.created_at <= v_period.correction_ends_at
    );

  with member_spend as (
    select
      pm.period_id,
      pm.user_id,
      pm.status,
      pm.joined_on,
      pm.eligible_day_count,
      pm.applied_limit,
      p.nickname,
      coalesce(sum(e.amount) filter (
        where e.deleted_at is null and e.excluded_at is null
      ), 0)::bigint as spent_amount
    from public.period_members pm
    join public.profiles p on p.id = pm.user_id
    left join public.expenses e
      on e.period_id = pm.period_id
     and e.user_id = pm.user_id
    where pm.period_id = p_period_id
    group by pm.period_id, pm.user_id, p.id
  ), calculated as (
    select
      ms.*,
      ms.applied_limit - ms.spent_amount as remaining_amount
    from member_spend ms
  ), ranked as (
    select
      c.*,
      max(c.remaining_amount) filter (where c.status = 'active') over () as max_active_remaining
    from calculated c
  )
  insert into public.period_results (
    period_id, user_id, room_id, nickname_snapshot, status_snapshot,
    joined_on, eligible_day_count, applied_limit,
    spent_amount, remaining_amount, achieved, is_crown, finalized_at
  )
  select
    p_period_id,
    r.user_id,
    v_period.room_id,
    r.nickname,
    r.status,
    r.joined_on,
    r.eligible_day_count,
    r.applied_limit,
    r.spent_amount,
    r.remaining_amount,
    r.spent_amount <= r.applied_limit,
    r.status = 'active' and r.remaining_amount = r.max_active_remaining,
    v_period.finalizes_at
  from ranked r;

  update public.periods
  set finalized_at = finalizes_at
  where id = p_period_id
  returning * into v_period;

  perform private.write_audit_event(
    auth.uid(),
    'period.finalized',
    'period',
    p_period_id,
    jsonb_build_object('room_id', v_period.room_id, 'week_index', v_period.week_index)
  );
  return v_period;
end;
$$;

--------------------------------------------------------------------------------
-- Grants (mirror the existing expense/comment RPC grant pattern)
--------------------------------------------------------------------------------

grant select on public.expense_exceptions to authenticated;
grant select on public.expense_exception_approvals to authenticated;

grant execute on function private.add_expense_with_exception_impl(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint, text
) to authenticated;
grant execute on function private.approve_expense_exception_impl(uuid) to authenticated;
grant execute on function private.remove_expense_exception_approval_impl(uuid) to authenticated;
grant execute on function private.withdraw_expense_exception_impl(uuid) to authenticated;

revoke execute on function public.add_expense(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint, text
) from public, anon, service_role;
revoke execute on function public.approve_expense_exception(uuid) from public, anon, service_role;
revoke execute on function public.remove_expense_exception_approval(uuid) from public, anon, service_role;
revoke execute on function public.withdraw_expense_exception(uuid) from public, anon, service_role;

grant execute on function public.add_expense(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint, text
) to authenticated;
grant execute on function public.approve_expense_exception(uuid) to authenticated;
grant execute on function public.remove_expense_exception_approval(uuid) to authenticated;
grant execute on function public.withdraw_expense_exception(uuid) to authenticated;

--------------------------------------------------------------------------------
-- Realtime: approvals/exceptions drive the home approval inbox
--------------------------------------------------------------------------------

do $realtime_setup$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'expense_exceptions',
      'expense_exception_approvals'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$realtime_setup$;
