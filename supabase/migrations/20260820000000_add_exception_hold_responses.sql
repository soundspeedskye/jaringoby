-- 예외 응답: 제시자는 동의 인원에서 제외하고, 다른 활성 멤버는 승인 또는
-- 보류를 고른다. 보류는 승인으로 계산되지 않으므로 정산 제외를 막는다.

create type public.expense_exception_response as enum ('approved', 'held');

alter table public.expense_exception_approvals
  add column decision public.expense_exception_response not null default 'approved';

-- 이전 버전은 제시자를 자동 승인으로 저장했다. 이제 제시자는 응답자가 아니므로
-- 기존 자동 행을 제거한다. 다른 멤버의 기존 승인은 그대로 유지된다.
delete from public.expense_exception_approvals a
using public.expense_exceptions x
where x.expense_id = a.expense_id
  and a.user_id = x.requested_by;

-- 새 예외는 더 이상 제시자의 자동 승인 행을 만들지 않는다.
create or replace function private.add_expense_with_exception_impl(
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

  return v_expense;
end;
$$;

create function private.respond_expense_exception_impl(
  p_expense_id uuid,
  p_decision public.expense_exception_response
)
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
  select e.* into v_expense from public.expenses e where e.id = p_expense_id;
  if v_expense.id is null or v_expense.period_id is null then
    raise exception using errcode = '22023', message = 'expense not found';
  end if;
  if not exists (select 1 from public.expense_exceptions x where x.expense_id = p_expense_id) then
    raise exception using errcode = '22023', message = 'no exception to respond to';
  end if;
  if v_expense.user_id = v_user_id then
    raise exception using errcode = '42501', message = 'the exception requester does not vote';
  end if;

  select p.* into v_period from public.periods p where p.id = v_expense.period_id;
  if statement_timestamp() >= v_period.correction_ends_at then
    raise exception using errcode = '22023', message = 'exception response deadline has passed';
  end if;
  if not private.is_active_period_member(v_expense.period_id, v_user_id) then
    raise exception using errcode = '42501', message = 'an active period membership is required';
  end if;

  insert into public.expense_exception_approvals (expense_id, user_id, decision)
  values (p_expense_id, v_user_id, p_decision)
  on conflict (expense_id, user_id) do update
  set decision = excluded.decision,
      created_at = statement_timestamp();
end;
$$;

create function public.respond_expense_exception(
  p_expense_id uuid,
  p_decision public.expense_exception_response
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.respond_expense_exception_impl(p_expense_id, p_decision);
$$;

-- 기존 앱 버전의 승인/승인 취소 RPC는 같은 응답 데이터를 쓰도록 유지한다.
create or replace function private.approve_expense_exception_impl(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.respond_expense_exception_impl(p_expense_id, 'approved');
end;
$$;

create or replace function private.remove_expense_exception_approval_impl(p_expense_id uuid)
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
  select e.* into v_expense from public.expenses e where e.id = p_expense_id;
  if v_expense.id is null or v_expense.period_id is null then
    raise exception using errcode = '22023', message = 'expense not found';
  end if;
  select p.* into v_period from public.periods p where p.id = v_expense.period_id;
  if statement_timestamp() >= v_period.correction_ends_at then
    raise exception using errcode = '22023', message = 'exception response deadline has passed';
  end if;
  delete from public.expense_exception_approvals
  where expense_id = p_expense_id and user_id = v_user_id;
end;
$$;

-- 정산에서는 제시자를 제외한 활성 멤버의 승인 수가 모두 찼을 때만 제외한다.
create or replace function private.finalize_period_core(p_period_id uuid)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.periods%rowtype;
begin
  select p.* into v_period from public.periods p where p.id = p_period_id for update;
  if v_period.id is null then
    raise exception using errcode = '22023', message = 'period not found';
  end if;
  if v_period.finalized_at is not null
     or exists (select 1 from public.period_results r where r.period_id = p_period_id) then
    return v_period;
  end if;
  if statement_timestamp() < v_period.finalizes_at then
    raise exception using errcode = '22023', message = 'period cannot be finalized before F';
  end if;

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
        and pm.user_id <> x.requested_by
    ) = (
      select count(*)
      from public.expense_exception_approvals a
      join public.period_members pm2
        on pm2.period_id = p_period_id
       and pm2.user_id = a.user_id
       and pm2.status = 'active'
      where a.expense_id = e.id
        and a.decision = 'approved'
        and a.created_at <= v_period.correction_ends_at
        and a.user_id <> x.requested_by
    );

  with member_spend as (
    select pm.period_id, pm.user_id, pm.status, pm.joined_on, pm.eligible_day_count,
      pm.applied_limit, p.nickname,
      coalesce(sum(e.amount) filter (where e.deleted_at is null and e.excluded_at is null), 0)::bigint as spent_amount
    from public.period_members pm
    join public.profiles p on p.id = pm.user_id
    left join public.expenses e on e.period_id = pm.period_id and e.user_id = pm.user_id
    where pm.period_id = p_period_id
    group by pm.period_id, pm.user_id, p.id
  ), calculated as (
    select ms.*, ms.applied_limit - ms.spent_amount as remaining_amount from member_spend ms
  ), ranked as (
    select c.*, max(c.remaining_amount) filter (where c.status = 'active') over () as max_active_remaining
    from calculated c
  )
  insert into public.period_results (
    period_id, user_id, room_id, nickname_snapshot, status_snapshot, joined_on,
    eligible_day_count, applied_limit, spent_amount, remaining_amount, achieved, is_crown, finalized_at
  )
  select p_period_id, r.user_id, v_period.room_id, r.nickname, r.status, r.joined_on,
    r.eligible_day_count, r.applied_limit, r.spent_amount, r.remaining_amount,
    r.spent_amount <= r.applied_limit,
    r.status = 'active' and r.remaining_amount = r.max_active_remaining,
    v_period.finalizes_at
  from ranked r;

  update public.periods set finalized_at = finalizes_at where id = p_period_id returning * into v_period;
  perform private.write_audit_event(
    auth.uid(), 'period.finalized', 'period', p_period_id,
    jsonb_build_object('room_id', v_period.room_id, 'week_index', v_period.week_index)
  );
  return v_period;
end;
$$;

revoke execute on function private.respond_expense_exception_impl(uuid, public.expense_exception_response)
from public, anon, authenticated, service_role;
grant execute on function private.respond_expense_exception_impl(uuid, public.expense_exception_response)
to authenticated;

revoke execute on function public.respond_expense_exception(uuid, public.expense_exception_response)
from public, anon, service_role;
grant execute on function public.respond_expense_exception(uuid, public.expense_exception_response)
to authenticated;
