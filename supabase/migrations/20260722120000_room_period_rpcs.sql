-- Room/period RPCs (docs/room-model-redesign.md §6 step 2).
-- Rebuilds the server surface on rooms + weekly periods: create_room /
-- preview_room_invite / join_room, period-based expense and comment RPCs,
-- weekly period creation + finalize (pg_cron), and the cumulative stats view
-- (D4). The proration mechanism is a single path (upsert_period_member) shared
-- by room creation (D6), mid-week joins (D3) and the weekly expansion (D7).

--------------------------------------------------------------------------------
-- 1. Photo ownership assertion (period-keyed)
--------------------------------------------------------------------------------

-- Paths are deterministic: expense-photos/{period-id|personal}/{user-id}/{object}
create function private.assert_owned_photo(
  p_user_id uuid,
  p_period_id uuid,
  p_photo_path text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uploaded_at timestamptz;
  v_expected_first_folder text;
begin
  if p_photo_path is null or p_photo_path ~ '(^/|\.\.)' then
    raise exception using errcode = '22023', message = 'a safe photo path is required';
  end if;

  v_expected_first_folder := coalesce(p_period_id::text, 'personal');
  if split_part(p_photo_path, '/', 1) <> v_expected_first_folder
     or split_part(p_photo_path, '/', 2) <> p_user_id::text
     or split_part(p_photo_path, '/', 3) = '' then
    raise exception using errcode = '22023', message = 'photo path does not match the user and period';
  end if;

  select o.created_at
  into v_uploaded_at
  from storage.objects o
  where o.bucket_id = 'expense-photos'
    and o.name = p_photo_path
    and o.owner_id = p_user_id::text;

  if v_uploaded_at is null then
    raise exception using errcode = '22023', message = 'photo upload was not completed by the current user';
  end if;

  return v_uploaded_at;
end;
$$;

--------------------------------------------------------------------------------
-- 2. Period creation (single proration path, D3/D6/D7)
--------------------------------------------------------------------------------

-- Inserts one member into a period with day-prorated limit:
-- joined_on = greatest(요청일, week_start), eligible = 남은 유효 평일(오늘 포함),
-- applied_limit = base_amount * eligible / selected (D2 formula).
-- Members with zero eligible days get no row: they participate from the next
-- period instead, and rest weeks (D5, valid_day_count = 0) stay member-less so
-- they never pollute results, crowns or streaks.
create function private.upsert_period_member(
  p_period_id uuid,
  p_user_id uuid,
  p_joined_on date
)
returns public.period_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.periods%rowtype;
  v_room public.rooms%rowtype;
  v_member public.period_members%rowtype;
  v_joined_on date;
  v_eligible integer;
begin
  select p.* into strict v_period
  from public.periods p
  where p.id = p_period_id;

  select r.* into strict v_room
  from public.rooms r
  where r.id = v_period.room_id;

  v_joined_on := greatest(p_joined_on, v_period.week_start);

  select count(*)::integer into v_eligible
  from public.period_days d
  where d.period_id = p_period_id
    and not d.is_holiday
    and d.day_on >= v_joined_on;

  if v_eligible <= 0 then
    return null;
  end if;

  insert into public.period_members (
    period_id, user_id, status, joined_on, is_late_join,
    eligible_day_count, applied_limit
  ) values (
    p_period_id, p_user_id, 'active', v_joined_on,
    -- late = missed at least one weekday; the Monday-00:00 cron expansion and
    -- a Monday join both start on week_start and are full participants.
    v_joined_on > v_period.week_start,
    v_eligible,
    (v_room.base_amount * v_eligible) / v_period.selected_day_count
  )
  on conflict (period_id, user_id) do nothing
  returning * into v_member;

  if v_member.period_id is null then
    select pm.* into strict v_member
    from public.period_members pm
    where pm.period_id = p_period_id
      and pm.user_id = p_user_id;
  end if;

  return v_member;
end;
$$;

-- Creates the Mon-Fri period for p_week_start (must be a Monday), resolves the
-- week's holidays from the current published dataset, and expands the room's
-- active members with proration from p_member_joined_on. Idempotent per
-- (room_id, week_start); week_index is serialized by the room row lock.
create function private.create_period_core(
  p_room_id uuid,
  p_week_start date,
  p_member_joined_on date
)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_version public.holiday_calendar_versions%rowtype;
  v_period public.periods%rowtype;
  v_week_end date := p_week_start + 4;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_holiday_count integer;
  v_member record;
begin
  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room.id is null then
    raise exception using errcode = '22023', message = 'room not found';
  end if;
  if v_room.status = 'closed' then
    raise exception using errcode = '22023', message = 'closed rooms do not open new periods';
  end if;

  select p.* into v_period
  from public.periods p
  where p.room_id = p_room_id
    and p.week_start = p_week_start;
  if found then
    return v_period;
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'a period must start on a Monday';
  end if;

  select hv.* into v_version
  from public.holiday_calendar_versions hv
  where hv.is_current
  order by hv.published_at desc
  limit 1;
  if v_version.id is null then
    raise exception using errcode = '22023', message = 'a published Korean holiday dataset is required';
  end if;
  if p_week_start < v_version.coverage_start or v_week_end > v_version.coverage_end then
    raise exception using errcode = '22023', message = 'the holiday dataset does not cover the target week';
  end if;

  v_starts_at := p_week_start::timestamp at time zone 'Asia/Seoul';
  v_ends_at := (v_week_end + 1)::timestamp at time zone 'Asia/Seoul';

  -- 집합 연산으로 평일에 걸린 공휴일만 차감 (weekend holidays never double-count;
  -- the day range is Mon-Fri so the weekday filter is belt and suspenders).
  select count(*)::integer into v_holiday_count
  from public.korean_holidays h
  where h.version_id = v_version.id
    and h.holiday_on between p_week_start and v_week_end
    and extract(isodow from h.holiday_on) between 1 and 5;

  insert into public.periods (
    room_id, week_index, week_start, week_end,
    starts_at, ends_at, correction_ends_at, finalizes_at,
    selected_day_count, valid_day_count, holiday_version_id
  )
  select
    p_room_id,
    coalesce(max(p.week_index), 0) + 1,
    p_week_start,
    v_week_end,
    v_starts_at,
    v_ends_at,
    v_ends_at + interval '12 hours',
    v_ends_at + interval '48 hours',
    5,
    5 - v_holiday_count,
    v_version.id
  from public.periods p
  where p.room_id = p_room_id
  returning * into v_period;

  insert into public.period_days (period_id, day_on, is_holiday, holiday_name)
  select
    v_period.id,
    day_value::date,
    h.holiday_on is not null,
    h.name
  from generate_series(
    p_week_start::timestamp,
    v_week_end::timestamp,
    interval '1 day'
  ) as day_value
  left join public.korean_holidays h
    on h.version_id = v_version.id
   and h.holiday_on = day_value::date;

  for v_member in
    select m.user_id
    from public.room_members m
    where m.room_id = p_room_id
      and m.status = 'active'
    order by m.joined_at, m.user_id
  loop
    perform private.upsert_period_member(v_period.id, v_member.user_id, p_member_joined_on);
  end loop;

  perform private.write_audit_event(
    auth.uid(),
    'period.created',
    'period',
    v_period.id,
    jsonb_build_object(
      'room_id', p_room_id,
      'week_index', v_period.week_index,
      'week_start', v_period.week_start,
      'valid_day_count', v_period.valid_day_count,
      'holiday_version_id', v_version.id
    )
  );

  return v_period;
end;
$$;

-- D7 + §7 fallback: called by cron every minute. On weekdays it ensures every
-- open room has this week's period; the normal path fires at Monday 00:00 KST
-- (= previous period's F), and a delayed cron simply creates the week late.
create function private.roll_rooms_forward(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('Asia/Seoul', now())::date;
  v_monday date;
  v_room record;
  v_count integer := 0;
begin
  if extract(isodow from v_today) > 5 then
    return 0;
  end if;
  v_monday := v_today - (extract(isodow from v_today)::integer - 1);

  for v_room in
    select r.id
    from public.rooms r
    where r.status = 'open'
      and not exists (
        select 1
        from public.periods p
        where p.room_id = r.id
          and p.week_start = v_monday
      )
    order by r.created_at, r.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    -- §7: one room's failure (e.g. a holiday dataset that no longer covers the
    -- target week) must not stall every other room's weekly opening.
    begin
      perform private.create_period_core(v_room.id, v_monday, v_monday);
      v_count := v_count + 1;
    exception when others then
      perform private.write_audit_event(
        null,
        'period.create_failed',
        'room',
        v_room.id,
        jsonb_build_object('week_start', v_monday, 'error', sqlerrm)
      );
    end;
  end loop;
  return v_count;
end;
$$;

--------------------------------------------------------------------------------
-- 3. Room lifecycle RPCs
--------------------------------------------------------------------------------

-- D6: weekday creation starts this week's period with the owner prorated from
-- today (inclusive); weekend creation opens next Monday's full week in WAITING.
create function private.create_room_impl(
  p_name text,
  p_base_amount bigint,
  p_capacity smallint,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_period public.periods%rowtype;
  v_member public.period_members%rowtype;
  v_today date := timezone('Asia/Seoul', now())::date;
  v_isodow integer := extract(isodow from v_today)::integer;
  v_week_start date;
  v_code text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id is required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.creator_id = v_user_id
    and r.client_request_id = p_client_request_id;
  if found then
    select p.* into v_period
    from public.periods p
    where p.room_id = v_room.id
    order by p.week_index desc
    limit 1;
    select pm.* into v_member
    from public.period_members pm
    where pm.period_id = v_period.id
      and pm.user_id = v_user_id;
    return jsonb_build_object(
      'ok', true,
      'room', to_jsonb(v_room),
      'period', to_jsonb(v_period),
      'member', to_jsonb(v_member),
      'idempotent', true
    );
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'room name must be 1 to 40 characters';
  end if;
  if p_base_amount is null or p_base_amount not between 1 and 1000000000000 then
    raise exception using errcode = '22023', message = 'base amount is outside the supported KRW range';
  end if;
  if p_capacity is not null and p_capacity not between 1 and 10 then
    raise exception using errcode = '22023', message = 'capacity must be between 1 and 10';
  end if;

  insert into public.profiles (id, nickname)
  values (v_user_id, '사용자')
  on conflict (id) do nothing;

  v_week_start := case
    when v_isodow <= 5 then v_today - (v_isodow - 1)
    else v_today + (8 - v_isodow)
  end;

  insert into public.rooms (
    name, creator_id, owner_id, base_amount, capacity, client_request_id
  ) values (
    btrim(p_name), v_user_id, v_user_id, p_base_amount,
    coalesce(p_capacity, 10::smallint), p_client_request_id
  )
  on conflict (creator_id, client_request_id) do nothing
  returning * into v_room;

  if v_room.id is null then
    select r.* into strict v_room
    from public.rooms r
    where r.creator_id = v_user_id
      and r.client_request_id = p_client_request_id;
    return private.create_room_impl(p_name, p_base_amount, p_capacity, p_client_request_id);
  end if;

  insert into public.room_members (room_id, user_id, role, status)
  values (v_room.id, v_user_id, 'owner', 'active');

  v_code := private.generate_invite_code();
  insert into public.invite_codes (room_id, code, created_by, expires_at)
  values (v_room.id, v_code, v_user_id, null);

  v_period := private.create_period_core(v_room.id, v_week_start, v_today);

  select pm.* into v_member
  from public.period_members pm
  where pm.period_id = v_period.id
    and pm.user_id = v_user_id;

  perform private.write_audit_event(
    v_user_id,
    'room.created',
    'room',
    v_room.id,
    jsonb_build_object(
      'base_amount', p_base_amount,
      'first_week_start', v_week_start,
      'first_period_id', v_period.id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'room', to_jsonb(v_room),
    'period', to_jsonb(v_period),
    'member', to_jsonb(v_member),
    'invite_code', v_code,
    'idempotent', false
  );
end;
$$;

create function public.create_room(
  p_name text,
  p_base_amount bigint,
  p_capacity smallint,
  p_client_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_room_impl(p_name, p_base_amount, p_capacity, p_client_request_id);
$$;

create function private.preview_room_invite_impl(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := left(upper(btrim(coalesce(p_invite_code, ''))), 32);
  v_invite public.invite_codes%rowtype;
  v_room public.rooms%rowtype;
  v_period public.periods%rowtype;
  v_existing public.room_members%rowtype;
  v_today date := timezone('Asia/Seoul', now())::date;
  v_joined_on date;
  v_eligible integer := 0;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if private.invite_lookup_is_rate_limited(v_user_id) then
    return jsonb_build_object('ok', false, 'error_code', 'RATE_LIMITED');
  end if;

  if v_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  end if;

  select i.* into v_invite
  from public.invite_codes i
  where i.code = v_code
    and i.is_active
    and (i.expires_at is null or i.expires_at > now());

  if v_invite.id is null then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  end if;

  select r.* into strict v_room
  from public.rooms r
  where r.id = v_invite.room_id;

  if v_room.status = 'closed' then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'ROOM_CLOSED');
  end if;

  select m.* into v_existing
  from public.room_members m
  where m.room_id = v_room.id
    and m.user_id = v_user_id;

  select count(*)::integer into v_member_count
  from public.room_members m
  where m.room_id = v_room.id
    and m.status = 'active';

  -- Current week: the latest period whose window is still open. Weekend
  -- lookups usually find none (join takes effect next Monday, D7).
  select p.* into v_period
  from public.periods p
  where p.room_id = v_room.id
    and statement_timestamp() < p.ends_at
  order by p.week_start desc
  limit 1;

  v_joined_on := v_today;
  if v_period.id is not null then
    v_joined_on := greatest(v_today, v_period.week_start);
    select count(*)::integer into v_eligible
    from public.period_days d
    where d.period_id = v_period.id
      and not d.is_holiday
      and d.day_on >= v_joined_on;
  end if;

  insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
  values (v_user_id, v_code, true);

  return jsonb_build_object(
    'ok', true,
    'room', jsonb_build_object(
      'id', v_room.id,
      'name', v_room.name,
      'base_amount', v_room.base_amount,
      'currency', v_room.currency,
      'timezone', v_room.timezone,
      'weekday_mask', v_room.weekday_mask,
      'capacity', v_room.capacity,
      'member_count', v_member_count,
      'status', v_room.status,
      'created_at', v_room.created_at
    ),
    'current_period', case
      when v_period.id is null then null
      else jsonb_build_object(
        'id', v_period.id,
        'week_index', v_period.week_index,
        'week_start', v_period.week_start,
        'week_end', v_period.week_end,
        'starts_at', v_period.starts_at,
        'ends_at', v_period.ends_at,
        'selected_day_count', v_period.selected_day_count,
        'valid_day_count', v_period.valid_day_count,
        'holidays', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object('date', d.day_on, 'name', d.holiday_name)
              order by d.day_on
            ) filter (where d.is_holiday),
            '[]'::jsonb
          )
          from public.period_days d
          where d.period_id = v_period.id
        )
      )
    end,
    'join', jsonb_build_object(
      'joined_on', v_joined_on,
      'eligible_day_count', v_eligible,
      'applied_limit', case
        when v_period.id is not null and v_eligible > 0
          then (v_room.base_amount * v_eligible) / v_period.selected_day_count
        else 0
      end,
      'is_late_join', v_period.id is not null
        and statement_timestamp() >= v_period.starts_at
        and v_joined_on > v_period.week_start,
      'participates_this_week', v_eligible > 0,
      'can_join', v_existing.user_id is null
        and v_member_count < v_room.capacity
    )
  );
end;
$$;

create function public.preview_room_invite(p_invite_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.preview_room_invite_impl(p_invite_code);
$$;

-- 방 가입(D3): joining the room is what matters; this week's participation is
-- prorated when days remain, otherwise it simply starts next Monday.
create function private.join_room_impl(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := left(upper(btrim(coalesce(p_invite_code, ''))), 32);
  v_invite public.invite_codes%rowtype;
  v_room public.rooms%rowtype;
  v_existing public.room_members%rowtype;
  v_member public.room_members%rowtype;
  v_period public.periods%rowtype;
  v_period_member public.period_members%rowtype;
  v_today date := timezone('Asia/Seoul', now())::date;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if private.invite_lookup_is_rate_limited(v_user_id) then
    return jsonb_build_object('ok', false, 'error_code', 'RATE_LIMITED');
  end if;

  if v_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  end if;

  select i.* into v_invite
  from public.invite_codes i
  where i.code = v_code
    and i.is_active
  for update;

  if v_invite.id is null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now()) then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  end if;

  select r.* into strict v_room
  from public.rooms r
  where r.id = v_invite.room_id
  for update;

  if v_room.status = 'closed' then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'ROOM_CLOSED');
  end if;

  select m.* into v_existing
  from public.room_members m
  where m.room_id = v_room.id
    and m.user_id = v_user_id;

  if v_existing.user_id is not null then
    if v_existing.status = 'active' then
      select pm.* into v_period_member
      from public.period_members pm
      join public.periods p on p.id = pm.period_id
      where p.room_id = v_room.id
        and pm.user_id = v_user_id
        and statement_timestamp() < p.ends_at
      order by p.week_start desc
      limit 1;
      return jsonb_build_object(
        'ok', true,
        'member', to_jsonb(v_existing),
        'period_member', to_jsonb(v_period_member),
        'idempotent', true
      );
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'ALREADY_PARTICIPATED');
  end if;

  select count(*)::integer into v_member_count
  from public.room_members m
  where m.room_id = v_room.id
    and m.status = 'active';
  if v_member_count >= v_room.capacity then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, true);
    return jsonb_build_object('ok', false, 'error_code', 'CAPACITY_FULL');
  end if;

  insert into public.profiles (id, nickname)
  values (v_user_id, '사용자')
  on conflict (id) do nothing;

  insert into public.room_members (room_id, user_id, role, status)
  values (v_room.id, v_user_id, 'member', 'active')
  returning * into v_member;

  select p.* into v_period
  from public.periods p
  where p.room_id = v_room.id
    and statement_timestamp() < p.ends_at
  order by p.week_start desc
  limit 1;

  if v_period.id is not null then
    v_period_member := private.upsert_period_member(v_period.id, v_user_id, v_today);
  end if;

  insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
  values (v_user_id, v_code, true);

  perform private.enqueue_notification(
    recipient.user_id,
    'member_joined',
    v_user_id,
    v_room.id,
    v_period.id,
    null,
    null,
    '/rooms/' || v_room.id::text || '/members',
    'member_joined:' || v_room.id::text || ':' || v_user_id::text
  )
  from public.room_members recipient
  where recipient.room_id = v_room.id
    and recipient.status = 'active'
    and recipient.user_id <> v_user_id;

  if v_member_count + 1 = v_room.capacity then
    perform private.enqueue_notification(
      v_room.owner_id,
      'capacity_full',
      v_user_id,
      v_room.id,
      null,
      null,
      null,
      '/rooms/' || v_room.id::text || '/members',
      'capacity_full:' || v_room.id::text
    );
  end if;

  perform private.write_audit_event(
    v_user_id,
    'room.joined',
    'room',
    v_room.id,
    jsonb_build_object(
      'joined_on', v_today,
      'period_id', v_period.id,
      'eligible_day_count', v_period_member.eligible_day_count,
      'applied_limit', v_period_member.applied_limit
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(v_member),
    'period_member', to_jsonb(v_period_member),
    'idempotent', false
  );
end;
$$;

create function public.join_room(p_invite_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.join_room_impl(p_invite_code);
$$;

create function private.update_room_settings_impl(
  p_room_id uuid,
  p_name text,
  p_capacity smallint
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_active_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room.id is null or v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the current room owner can update settings';
  end if;
  if v_room.status = 'closed' then
    raise exception using errcode = '22023', message = 'closed rooms are read-only';
  end if;

  if p_name is not null and char_length(btrim(p_name)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'room name must be 1 to 40 characters';
  end if;

  if p_capacity is not null then
    select count(*)::integer into v_active_count
    from public.room_members m
    where m.room_id = p_room_id
      and m.status = 'active';
    if p_capacity < v_room.capacity
       or p_capacity < v_active_count
       or p_capacity > 10 then
      raise exception using errcode = '22023', message = 'capacity can only increase up to 10';
    end if;
  end if;

  update public.rooms
  set name = coalesce(btrim(p_name), name),
      capacity = coalesce(p_capacity, capacity)
  where id = p_room_id
  returning * into v_room;

  perform private.write_audit_event(
    v_user_id,
    'room.settings_updated',
    'room',
    p_room_id,
    jsonb_build_object('name', v_room.name, 'capacity', v_room.capacity)
  );
  return v_room;
end;
$$;

create function public.update_room_settings(
  p_room_id uuid,
  p_name text,
  p_capacity smallint
)
returns public.rooms
language sql
security invoker
set search_path = ''
as $$
  select private.update_room_settings_impl(p_room_id, p_name, p_capacity);
$$;

create function private.rotate_invite_code_impl(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_code text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room.id is null or v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the current room owner can rotate invite codes';
  end if;
  if v_room.status = 'closed' then
    raise exception using errcode = '22023', message = 'closed rooms are read-only';
  end if;

  update public.invite_codes
  set is_active = false,
      revoked_at = statement_timestamp()
  where room_id = p_room_id
    and is_active;

  v_code := private.generate_invite_code();
  insert into public.invite_codes (room_id, code, created_by, expires_at)
  values (p_room_id, v_code, v_user_id, null);

  perform private.write_audit_event(
    v_user_id,
    'room.invite_rotated',
    'room',
    p_room_id,
    '{}'::jsonb
  );
  return v_code;
end;
$$;

create function public.rotate_invite_code(p_room_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.rotate_invite_code_impl(p_room_id);
$$;

-- Leaving is allowed at any time (rooms are open-ended). The current week's
-- participation row is marked left while the week is running, or removed
-- outright from a period that has not started yet.
create function private.leave_room_impl(
  p_room_id uuid,
  p_successor_user_id uuid
)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_successor public.room_members%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room.id is null then
    raise exception using errcode = '22023', message = 'room not found';
  end if;

  select m.* into v_member
  from public.room_members m
  where m.room_id = p_room_id
    and m.user_id = v_user_id
  for update;
  if v_member.user_id is null or v_member.status <> 'active' then
    raise exception using errcode = '42501', message = 'active membership not found';
  end if;

  if v_member.role = 'owner' then
    if p_successor_user_id is null or p_successor_user_id = v_user_id then
      raise exception using errcode = '22023', message = 'room owner must select another active member as successor';
    end if;
    select m.* into v_successor
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = p_successor_user_id
      and m.status = 'active'
    for update;
    if v_successor.user_id is null then
      raise exception using errcode = '22023', message = 'successor must be an active room member';
    end if;

    update public.room_members
    set role = 'member', status = 'left', left_at = statement_timestamp()
    where room_id = p_room_id and user_id = v_user_id
    returning * into v_member;

    update public.room_members
    set role = 'owner'
    where room_id = p_room_id and user_id = p_successor_user_id;

    update public.rooms
    set owner_id = p_successor_user_id
    where id = p_room_id;
  else
    update public.room_members
    set status = 'left', left_at = statement_timestamp()
    where room_id = p_room_id and user_id = v_user_id
    returning * into v_member;
  end if;

  delete from public.period_members pm
  using public.periods p
  where p.id = pm.period_id
    and p.room_id = p_room_id
    and pm.user_id = v_user_id
    and statement_timestamp() < p.starts_at;

  update public.period_members pm
  set status = 'left', left_at = statement_timestamp()
  from public.periods p
  where p.id = pm.period_id
    and p.room_id = p_room_id
    and pm.user_id = v_user_id
    and pm.status = 'active'
    and statement_timestamp() >= p.starts_at
    and statement_timestamp() < p.ends_at;

  perform private.write_audit_event(
    v_user_id,
    'room.left',
    'room',
    p_room_id,
    jsonb_build_object('successor_user_id', p_successor_user_id)
  );
  return v_member;
end;
$$;

create function public.leave_room(
  p_room_id uuid,
  p_successor_user_id uuid
)
returns public.room_members
language sql
security invoker
set search_path = ''
as $$
  select private.leave_room_impl(p_room_id, p_successor_user_id);
$$;

-- §3.5 방 닫기: stops future periods and freezes writes; history stays
-- readable and the in-flight period still settles via cron.
create function private.close_room_impl(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;
  if v_room.id is null or v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the current room owner can close a room';
  end if;
  if v_room.status = 'closed' then
    return v_room;
  end if;

  update public.rooms
  set status = 'closed',
      closed_at = statement_timestamp()
  where id = p_room_id
  returning * into v_room;

  update public.invite_codes
  set is_active = false,
      revoked_at = statement_timestamp()
  where room_id = p_room_id
    and is_active;

  perform private.write_audit_event(
    v_user_id,
    'room.closed',
    'room',
    p_room_id,
    jsonb_build_object('name', v_room.name)
  );
  return v_room;
end;
$$;

create function public.close_room(p_room_id uuid)
returns public.rooms
language sql
security invoker
set search_path = ''
as $$
  select private.close_room_impl(p_room_id);
$$;

--------------------------------------------------------------------------------
-- 4. Expense RPCs (period-keyed)
--------------------------------------------------------------------------------

create function private.add_expense_impl(
  p_period_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_client_request_id uuid
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

  if p_amount not between 1 and 1000000000000 then
    raise exception using errcode = '22023', message = 'expense amount is outside the supported KRW range';
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

    -- D3: 합류일 포함(day granularity) — an expense earlier the same day as the
    -- join is valid, because the join day counts toward the limit.
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
    user_id, period_id, amount, category, occurred_at, memo,
    photo_path, photo_uploaded_at, client_request_id
  ) values (
    v_user_id, p_period_id, p_amount, p_category, p_occurred_at,
    nullif(p_memo, ''), p_photo_path, v_photo_uploaded_at,
    p_client_request_id
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
    jsonb_build_object('period_id', p_period_id, 'amount', p_amount)
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
  p_client_request_id uuid
)
returns public.expenses
language sql
security invoker
set search_path = ''
as $$
  select private.add_expense_impl(
    p_period_id, p_amount, p_category, p_occurred_at,
    p_memo, p_photo_path, p_client_request_id
  );
$$;

create function private.update_expense_impl(
  p_expense_id uuid,
  p_amount bigint,
  p_category public.expense_category,
  p_occurred_at timestamptz,
  p_memo text,
  p_photo_path text,
  p_expected_version integer
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
  if p_amount not between 1 and 1000000000000
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
    jsonb_build_object('version', v_expense.version)
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
  p_expected_version integer
)
returns public.expenses
language sql
security invoker
set search_path = ''
as $$
  select private.update_expense_impl(
    p_expense_id, p_amount, p_category, p_occurred_at,
    p_memo, p_photo_path, p_expected_version
  );
$$;

create function private.delete_expense_impl(
  p_expense_id uuid,
  p_expected_version integer
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_deadline timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = p_expense_id
  for update;
  if v_expense.id is null or v_expense.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'expense not found or not owned by current user';
  end if;
  if v_expense.deleted_at is not null then
    return v_expense;
  end if;
  if v_expense.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'expense version conflict';
  end if;

  if v_expense.period_id is not null then
    select p.correction_ends_at into strict v_deadline
    from public.periods p
    where p.id = v_expense.period_id;
    if statement_timestamp() >= v_deadline then
      raise exception using errcode = '22023', message = 'expense adjustment deadline has passed';
    end if;
    if exists (
      select 1
      from public.periods p
      join public.rooms r on r.id = p.room_id
      where p.id = v_expense.period_id
        and r.status = 'closed'
    ) then
      raise exception using errcode = '22023', message = 'closed rooms are read-only';
    end if;
  end if;

  update public.expenses
  set deleted_at = statement_timestamp(),
      version = version + 1,
      edited_at = statement_timestamp()
  where id = p_expense_id
  returning * into v_expense;

  perform private.write_audit_event(
    v_user_id,
    'expense.deleted',
    'expense',
    v_expense.id,
    jsonb_build_object('version', v_expense.version)
  );
  return v_expense;
end;
$$;

create function public.delete_expense(
  p_expense_id uuid,
  p_expected_version integer
)
returns public.expenses
language sql
security invoker
set search_path = ''
as $$
  select private.delete_expense_impl(p_expense_id, p_expected_version);
$$;

--------------------------------------------------------------------------------
-- 5. Comment RPCs
--------------------------------------------------------------------------------

create function private.add_comment_impl(
  p_expense_id uuid,
  p_body text,
  p_reply_to_comment_id uuid,
  p_client_request_id uuid
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_period public.periods%rowtype;
  v_parent public.comments%rowtype;
  v_comment public.comments%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id is required';
  end if;

  select c.* into v_comment
  from public.comments c
  where c.user_id = v_user_id
    and c.client_request_id = p_client_request_id;
  if found then
    return v_comment;
  end if;

  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'comment body must be 1 to 500 characters excluding surrounding whitespace';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = p_expense_id;
  if v_expense.id is null
     or v_expense.period_id is null
     or v_expense.deleted_at is not null then
    raise exception using errcode = '22023', message = 'comments require a visible period expense';
  end if;

  select p.* into strict v_period
  from public.periods p
  where p.id = v_expense.period_id;
  if statement_timestamp() < v_period.starts_at
     or statement_timestamp() >= v_period.finalizes_at then
    raise exception using errcode = '22023', message = 'comments are writable only from period start through settlement';
  end if;
  if not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'an active room membership is required';
  end if;

  if p_reply_to_comment_id is not null then
    select c.* into v_parent
    from public.comments c
    where c.id = p_reply_to_comment_id;
    if v_parent.id is null or v_parent.expense_id <> p_expense_id then
      raise exception using errcode = '22023', message = 'reply target must be a comment on the same expense';
    end if;
  end if;

  insert into public.comments (
    expense_id, user_id, reply_to_comment_id, body, client_request_id
  ) values (
    p_expense_id, v_user_id, p_reply_to_comment_id, btrim(p_body),
    p_client_request_id
  )
  on conflict (user_id, client_request_id) do nothing
  returning * into v_comment;

  if v_comment.id is null then
    select c.* into strict v_comment
    from public.comments c
    where c.user_id = v_user_id
      and c.client_request_id = p_client_request_id;
    return v_comment;
  end if;

  if v_expense.user_id <> v_user_id
     and (
       p_reply_to_comment_id is null
       or v_expense.user_id is distinct from v_parent.user_id
     ) then
    perform private.enqueue_notification(
      v_expense.user_id,
      'expense_comment',
      v_user_id,
      v_period.room_id,
      v_period.id,
      v_expense.id,
      v_comment.id,
      '/rooms/' || v_period.room_id::text
        || '/periods/' || v_period.id::text
        || '/expenses/' || v_expense.id::text,
      'expense_comment:' || v_comment.id::text
    );
  end if;

  if p_reply_to_comment_id is not null then
    perform private.enqueue_notification(
      v_parent.user_id,
      'comment_reply',
      v_user_id,
      v_period.room_id,
      v_period.id,
      v_expense.id,
      v_comment.id,
      '/rooms/' || v_period.room_id::text
        || '/periods/' || v_period.id::text
        || '/expenses/' || v_expense.id::text,
      'comment_reply:' || v_comment.id::text
    );
  end if;

  perform private.write_audit_event(
    v_user_id,
    'comment.created',
    'comment',
    v_comment.id,
    jsonb_build_object(
      'expense_id', p_expense_id,
      'reply_to_comment_id', p_reply_to_comment_id
    )
  );
  return v_comment;
end;
$$;

create function public.add_comment(
  p_expense_id uuid,
  p_body text,
  p_reply_to_comment_id uuid,
  p_client_request_id uuid
)
returns public.comments
language sql
security invoker
set search_path = ''
as $$
  select private.add_comment_impl(
    p_expense_id, p_body, p_reply_to_comment_id, p_client_request_id
  );
$$;

create function private.update_comment_impl(
  p_comment_id uuid,
  p_body text,
  p_expected_version integer
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.comments%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'comment body must be 1 to 500 characters';
  end if;

  select c.* into v_comment
  from public.comments c
  where c.id = p_comment_id
  for update;
  if v_comment.id is null or v_comment.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'comment not found or not owned by current user';
  end if;
  if v_comment.deleted_at is not null then
    raise exception using errcode = '22023', message = 'deleted comment cannot be edited';
  end if;
  if v_comment.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'comment version conflict';
  end if;
  if statement_timestamp() >= v_comment.created_at + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'comment edit window has expired';
  end if;

  select p.* into strict v_period
  from public.periods p
  join public.expenses e on e.period_id = p.id
  where e.id = v_comment.expense_id;
  if statement_timestamp() >= v_period.finalizes_at
     or not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'comment is read-only';
  end if;

  update public.comments
  set body = btrim(p_body),
      version = version + 1,
      edited_at = statement_timestamp()
  where id = p_comment_id
  returning * into v_comment;

  perform private.write_audit_event(
    v_user_id,
    'comment.updated',
    'comment',
    v_comment.id,
    jsonb_build_object('version', v_comment.version)
  );
  return v_comment;
end;
$$;

create function public.update_comment(
  p_comment_id uuid,
  p_body text,
  p_expected_version integer
)
returns public.comments
language sql
security invoker
set search_path = ''
as $$
  select private.update_comment_impl(p_comment_id, p_body, p_expected_version);
$$;

create function private.delete_comment_impl(
  p_comment_id uuid,
  p_expected_version integer
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.comments%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select c.* into v_comment
  from public.comments c
  where c.id = p_comment_id
  for update;
  if v_comment.id is null or v_comment.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'comment not found or not owned by current user';
  end if;
  if v_comment.deleted_at is not null then
    return v_comment;
  end if;
  if v_comment.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'comment version conflict';
  end if;

  select p.* into strict v_period
  from public.periods p
  join public.expenses e on e.period_id = p.id
  where e.id = v_comment.expense_id;
  if statement_timestamp() >= v_period.finalizes_at
     or not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'comment is read-only';
  end if;

  update public.comments
  set body = null,
      deleted_at = statement_timestamp(),
      version = version + 1,
      edited_at = statement_timestamp()
  where id = p_comment_id
  returning * into v_comment;

  perform private.write_audit_event(
    v_user_id,
    'comment.deleted',
    'comment',
    v_comment.id,
    jsonb_build_object('version', v_comment.version)
  );
  return v_comment;
end;
$$;

create function public.delete_comment(
  p_comment_id uuid,
  p_expected_version integer
)
returns public.comments
language sql
security invoker
set search_path = ''
as $$
  select private.delete_comment_impl(p_comment_id, p_expected_version);
$$;

--------------------------------------------------------------------------------
-- 6. Weekly settlement (기존 finalize 로직 재사용)
--------------------------------------------------------------------------------

create function private.finalize_period_core(p_period_id uuid)
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

create function private.finalize_period_for_member_impl(p_period_id uuid)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select p.room_id into v_room_id
  from public.periods p
  where p.id = p_period_id;
  if v_room_id is null or not private.is_room_member(v_room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'room membership required';
  end if;
  return private.finalize_period_core(p_period_id);
end;
$$;

create function public.finalize_period(p_period_id uuid)
returns public.periods
language sql
security invoker
set search_path = ''
as $$
  select private.finalize_period_for_member_impl(p_period_id);
$$;

create function private.finalize_due_periods(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select p.id
    from public.periods p
    where p.finalizes_at <= statement_timestamp()
      and p.finalized_at is null
    order by p.finalizes_at, p.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform private.finalize_period_core(v_row.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

--------------------------------------------------------------------------------
-- 7. Cumulative stats (D4: streak · achieved weeks · crowns)
--------------------------------------------------------------------------------

-- D5: rest weeks (valid_day_count = 0) are excluded entirely, so they neither
-- count nor break a streak. current_streak counts consecutive achieved results
-- from the member's most recent finalized week backwards.
create view public.room_member_stats
with (security_invoker = true)
as
with scored as (
  select
    r.room_id,
    r.user_id,
    p.week_index,
    r.achieved,
    r.is_crown
  from public.period_results r
  join public.periods p on p.id = r.period_id
  where p.valid_day_count > 0
), ranked as (
  select
    s.*,
    row_number() over (
      partition by s.room_id, s.user_id
      order by s.week_index desc
    ) as recency_rank
  from scored s
), with_fail as (
  select
    r.*,
    min(r.recency_rank) filter (where not r.achieved) over (
      partition by r.room_id, r.user_id
    ) as first_fail_rank
  from ranked r
)
select
  w.room_id,
  w.user_id,
  count(*)::integer as participated_week_count,
  count(*) filter (where w.achieved)::integer as achieved_week_count,
  count(*) filter (where w.is_crown)::integer as crown_count,
  count(*) filter (
    where w.achieved
      and (w.first_fail_rank is null or w.recency_rank < w.first_fail_rank)
  )::integer as current_streak
from with_fail w
group by w.room_id, w.user_id;

--------------------------------------------------------------------------------
-- 8. Grants
--------------------------------------------------------------------------------

revoke all on table public.room_member_stats from public, anon, service_role;
grant select on table public.room_member_stats to authenticated;

-- Private functions are born with PUBLIC execute; lock everything down, then
-- re-grant the RLS helpers (from the schema migration) and the impls reached
-- through public security-invoker RPCs. Cron/internal functions
-- (create_period_core, upsert_period_member, roll_rooms_forward,
-- finalize_period_core, finalize_due_periods, assert_owned_photo) run as
-- postgres inside definer functions and need no grants.
revoke execute on all functions in schema private
from public, anon, authenticated, service_role;

grant execute on function private.is_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_active_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_period_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_active_period_member(uuid, uuid) to authenticated;
grant execute on function private.shares_room(uuid, uuid) to authenticated;

grant execute on function private.create_room_impl(text, bigint, smallint, uuid) to authenticated;
grant execute on function private.preview_room_invite_impl(text) to authenticated;
grant execute on function private.join_room_impl(text) to authenticated;
grant execute on function private.update_room_settings_impl(uuid, text, smallint) to authenticated;
grant execute on function private.rotate_invite_code_impl(uuid) to authenticated;
grant execute on function private.leave_room_impl(uuid, uuid) to authenticated;
grant execute on function private.close_room_impl(uuid) to authenticated;
grant execute on function private.add_expense_impl(uuid, bigint, public.expense_category, timestamptz, text, text, uuid) to authenticated;
grant execute on function private.update_expense_impl(uuid, bigint, public.expense_category, timestamptz, text, text, integer) to authenticated;
grant execute on function private.delete_expense_impl(uuid, integer) to authenticated;
grant execute on function private.add_comment_impl(uuid, text, uuid, uuid) to authenticated;
grant execute on function private.update_comment_impl(uuid, text, integer) to authenticated;
grant execute on function private.delete_comment_impl(uuid, integer) to authenticated;
grant execute on function private.finalize_period_for_member_impl(uuid) to authenticated;

revoke execute on function public.create_room(text, bigint, smallint, uuid) from public, anon, service_role;
revoke execute on function public.preview_room_invite(text) from public, anon, service_role;
revoke execute on function public.join_room(text) from public, anon, service_role;
revoke execute on function public.update_room_settings(uuid, text, smallint) from public, anon, service_role;
revoke execute on function public.rotate_invite_code(uuid) from public, anon, service_role;
revoke execute on function public.leave_room(uuid, uuid) from public, anon, service_role;
revoke execute on function public.close_room(uuid) from public, anon, service_role;
revoke execute on function public.add_expense(uuid, bigint, public.expense_category, timestamptz, text, text, uuid) from public, anon, service_role;
revoke execute on function public.update_expense(uuid, bigint, public.expense_category, timestamptz, text, text, integer) from public, anon, service_role;
revoke execute on function public.delete_expense(uuid, integer) from public, anon, service_role;
revoke execute on function public.add_comment(uuid, text, uuid, uuid) from public, anon, service_role;
revoke execute on function public.update_comment(uuid, text, integer) from public, anon, service_role;
revoke execute on function public.delete_comment(uuid, integer) from public, anon, service_role;
revoke execute on function public.finalize_period(uuid) from public, anon, service_role;

grant execute on function public.create_room(text, bigint, smallint, uuid) to authenticated;
grant execute on function public.preview_room_invite(text) to authenticated;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.update_room_settings(uuid, text, smallint) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;
grant execute on function public.leave_room(uuid, uuid) to authenticated;
grant execute on function public.close_room(uuid) to authenticated;
grant execute on function public.add_expense(uuid, bigint, public.expense_category, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.update_expense(uuid, bigint, public.expense_category, timestamptz, text, text, integer) to authenticated;
grant execute on function public.delete_expense(uuid, integer) to authenticated;
grant execute on function public.add_comment(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.update_comment(uuid, text, integer) to authenticated;
grant execute on function public.delete_comment(uuid, integer) to authenticated;
grant execute on function public.finalize_period(uuid) to authenticated;

--------------------------------------------------------------------------------
-- 9. Cron (D7 + finalize)
--------------------------------------------------------------------------------

do $cron_setup$
begin
  if not exists (
    select 1 from cron.job where jobname = 'jaringoby-finalize-due-periods'
  ) then
    perform cron.schedule(
      'jaringoby-finalize-due-periods',
      '* * * * *',
      'select private.finalize_due_periods(100);'
    );
  end if;

  if not exists (
    select 1 from cron.job where jobname = 'jaringoby-roll-rooms-forward'
  ) then
    perform cron.schedule(
      'jaringoby-roll-rooms-forward',
      '* * * * *',
      'select private.roll_rooms_forward(100);'
    );
  end if;
end
$cron_setup$;
