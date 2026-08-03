-- Point usage is recorded separately from the budget-counted payment amount.
-- `amount` remains the amount that consumes a member's challenge budget;
-- `point_amount` is informative only and never participates in settlement sums.

alter table public.expenses
  add column point_amount bigint not null default 0,
  add constraint expenses_point_amount
    check (point_amount between 0 and 1000000000000);

--------------------------------------------------------------------------------
-- Point-aware expense RPCs
--
-- Keep the existing 7-argument public RPCs for already-installed app versions.
-- New clients call these 8-argument overloads; named RPC argument resolution
-- selects the matching version, while old clients receive point_amount = 0 from
-- the column default through the legacy implementation.
--------------------------------------------------------------------------------

create function private.add_expense_with_point_amount_impl(
  p_period_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_client_request_id uuid,
  p_point_amount bigint
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_period public.periods%rowtype;
  v_room public.rooms%rowtype;
  v_member public.period_members%rowtype;
  v_expense public.expenses%rowtype;
  v_photo_uploaded_at timestamptz;
  v_occurred_on date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id is required';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.user_id = v_user_id
    and e.client_request_id = p_client_request_id;
  if found then
    return v_expense;
  end if;

  if p_amount is null or p_amount not between 0 and 1000000000000 then
    raise exception using errcode = '22023', message = 'expense amount is outside the supported KRW range';
  end if;
  if p_point_amount is null or p_point_amount not between 0 and 1000000000000 then
    raise exception using errcode = '22023', message = 'point amount is outside the supported range';
  end if;
  if p_category is null then
    raise exception using errcode = '22023', message = 'one of the six expense categories is required';
  end if;
  if p_occurred_at is null then
    raise exception using errcode = '22023', message = 'occurred_at is required';
  end if;
  if p_memo is not null and char_length(p_memo) > 500 then
    raise exception using errcode = '22023', message = 'memo must be at most 500 characters';
  end if;

  if p_period_id is null then
    if p_photo_path is not null then
      v_photo_uploaded_at := private.assert_owned_photo(v_user_id, null, p_photo_path);
    end if;
  else
    select p.* into v_period
    from public.periods p
    where p.id = p_period_id
    for share;

    if v_period.id is null then
      raise exception using errcode = '22023', message = 'period not found';
    end if;
    if v_now < v_period.starts_at or v_now >= v_period.correction_ends_at then
      raise exception using errcode = '22023', message = 'period expenses are writable only during active and adjustment states';
    end if;

    select r.* into strict v_room
    from public.rooms r
    where r.id = v_period.room_id;
    if v_room.status = 'closed' then
      raise exception using errcode = '22023', message = 'closed rooms are read-only';
    end if;

    select pm.* into v_member
    from public.period_members pm
    where pm.period_id = p_period_id
      and pm.user_id = v_user_id
      and pm.status = 'active';
    if v_member.user_id is null then
      raise exception using errcode = '42501', message = 'an active period membership is required';
    end if;

    if p_occurred_at < v_period.starts_at or p_occurred_at >= v_period.ends_at then
      raise exception using errcode = '22023', message = 'expense time is outside the period';
    end if;

    v_occurred_on := timezone(v_room.timezone, p_occurred_at)::date;
    if v_occurred_on < v_member.joined_on then
      raise exception using errcode = '22023', message = 'expense time is outside the member eligible period';
    end if;
    if not exists (
      select 1
      from public.period_days d
      where d.period_id = p_period_id
        and d.day_on = v_occurred_on
        and not d.is_holiday
    ) then
      raise exception using errcode = '22023', message = 'period expenses cannot be linked to an excluded holiday';
    end if;

    if p_photo_path is null then
      raise exception using errcode = '22023', message = 'exactly one uploaded photo is required for a period expense';
    end if;
    v_photo_uploaded_at := private.assert_owned_photo(v_user_id, p_period_id, p_photo_path);
    if v_photo_uploaded_at >= v_period.correction_ends_at then
      raise exception using errcode = '22023', message = 'photo upload completed after the adjustment deadline';
    end if;
  end if;

  insert into public.expenses (
    user_id, period_id, amount, point_amount, category, occurred_at, memo,
    photo_path, photo_uploaded_at, client_request_id
  ) values (
    v_user_id, p_period_id, p_amount, p_point_amount, p_category, p_occurred_at,
    nullif(p_memo, ''), p_photo_path, v_photo_uploaded_at, p_client_request_id
  )
  on conflict (user_id, client_request_id) do nothing
  returning * into v_expense;

  if v_expense.id is null then
    select e.* into strict v_expense
    from public.expenses e
    where e.user_id = v_user_id
      and e.client_request_id = p_client_request_id;
    return v_expense;
  end if;

  perform private.write_audit_event(
    v_user_id,
    'expense.created',
    'expense',
    v_expense.id,
    jsonb_build_object(
      'period_id', p_period_id,
      'amount', p_amount,
      'point_amount', p_point_amount
    )
  );
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
  p_point_amount bigint
)
returns public.expenses
language sql
security invoker
set search_path = ''
as $$
  select private.add_expense_with_point_amount_impl(
    p_period_id, p_amount, p_category, p_occurred_at,
    p_memo, p_photo_path, p_client_request_id, p_point_amount
  );
$$;

create function private.update_expense_with_point_amount_impl(
  p_expense_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_expected_version integer,
  p_point_amount bigint
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_expense public.expenses%rowtype;
  v_period public.periods%rowtype;
  v_room public.rooms%rowtype;
  v_member public.period_members%rowtype;
  v_photo_uploaded_at timestamptz;
  v_occurred_on date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'expected_version is required';
  end if;
  if p_amount is null or p_amount not between 0 and 1000000000000
     or p_point_amount is null or p_point_amount not between 0 and 1000000000000
     or p_category is null
     or p_occurred_at is null
     or (p_memo is not null and char_length(p_memo) > 500) then
    raise exception using errcode = '22023', message = 'invalid expense fields';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = p_expense_id
  for update;

  if v_expense.id is null or v_expense.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'expense not found or not owned by current user';
  end if;
  if v_expense.deleted_at is not null or v_expense.excluded_at is not null then
    raise exception using errcode = '22023', message = 'deleted or excluded expense cannot be edited';
  end if;
  if v_expense.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'expense version conflict';
  end if;

  if v_expense.period_id is null then
    if p_photo_path is not null then
      v_photo_uploaded_at := private.assert_owned_photo(v_user_id, null, p_photo_path);
    end if;
  else
    select p.* into strict v_period
    from public.periods p
    where p.id = v_expense.period_id
    for share;
    if v_now >= v_period.correction_ends_at then
      raise exception using errcode = '22023', message = 'expense adjustment deadline has passed';
    end if;

    select r.* into strict v_room
    from public.rooms r
    where r.id = v_period.room_id;
    if v_room.status = 'closed' then
      raise exception using errcode = '22023', message = 'closed rooms are read-only';
    end if;

    select pm.* into v_member
    from public.period_members pm
    where pm.period_id = v_expense.period_id
      and pm.user_id = v_user_id
      and pm.status = 'active';
    if v_member.user_id is null then
      raise exception using errcode = '42501', message = 'an active period membership is required';
    end if;

    if p_occurred_at < v_period.starts_at or p_occurred_at >= v_period.ends_at then
      raise exception using errcode = '22023', message = 'expense time is outside the period';
    end if;

    v_occurred_on := timezone(v_room.timezone, p_occurred_at)::date;
    if v_occurred_on < v_member.joined_on then
      raise exception using errcode = '22023', message = 'expense time is outside the member eligible period';
    end if;
    if not exists (
      select 1
      from public.period_days d
      where d.period_id = v_expense.period_id
        and d.day_on = v_occurred_on
        and not d.is_holiday
    ) then
      raise exception using errcode = '22023', message = 'period expenses cannot be linked to an excluded holiday';
    end if;

    if p_photo_path is null then
      raise exception using errcode = '22023', message = 'exactly one uploaded photo is required for a period expense';
    end if;
    v_photo_uploaded_at := private.assert_owned_photo(v_user_id, v_expense.period_id, p_photo_path);
    if v_photo_uploaded_at >= v_period.correction_ends_at then
      raise exception using errcode = '22023', message = 'photo upload completed after the adjustment deadline';
    end if;
  end if;

  update public.expenses
  set amount = p_amount,
      point_amount = p_point_amount,
      category = p_category,
      occurred_at = p_occurred_at,
      memo = nullif(p_memo, ''),
      photo_path = p_photo_path,
      photo_uploaded_at = v_photo_uploaded_at,
      version = version + 1,
      edited_at = v_now
  where id = p_expense_id
  returning * into v_expense;

  perform private.write_audit_event(
    v_user_id,
    'expense.updated',
    'expense',
    v_expense.id,
    jsonb_build_object('version', v_expense.version, 'point_amount', p_point_amount)
  );
  return v_expense;
end;
$$;

create function public.update_expense(
  p_expense_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_expected_version integer,
  p_point_amount bigint
)
returns public.expenses
language sql
security invoker
set search_path = ''
as $$
  select private.update_expense_with_point_amount_impl(
    p_expense_id, p_amount, p_category, p_occurred_at,
    p_memo, p_photo_path, p_expected_version, p_point_amount
  );
$$;

revoke execute on function private.add_expense_with_point_amount_impl(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint
) from public, anon, service_role;
revoke execute on function private.update_expense_with_point_amount_impl(
  uuid, bigint, public.expense_category, timestamptz, text, text, integer, bigint
) from public, anon, service_role;
revoke execute on function public.add_expense(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint
) from public, anon, service_role;
revoke execute on function public.update_expense(
  uuid, bigint, public.expense_category, timestamptz, text, text, integer, bigint
) from public, anon, service_role;

grant execute on function private.add_expense_with_point_amount_impl(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint
) to authenticated;
grant execute on function private.update_expense_with_point_amount_impl(
  uuid, bigint, public.expense_category, timestamptz, text, text, integer, bigint
) to authenticated;
grant execute on function public.add_expense(
  uuid, bigint, public.expense_category, timestamptz, text, text, uuid, bigint
) to authenticated;
grant execute on function public.update_expense(
  uuid, bigint, public.expense_category, timestamptz, text, text, integer, bigint
) to authenticated;
