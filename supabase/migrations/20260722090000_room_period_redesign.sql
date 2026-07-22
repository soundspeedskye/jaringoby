-- Room/period redesign (docs/room-model-redesign.md, D1-D7).
-- Strategy (a) full replacement: the remote database has no production data,
-- so this append-only migration drops the challenge-era objects and rebuilds
-- the schema around rooms (fixed settings + membership) and weekly periods.
-- Step 1 of 6: schema only. RPCs, weekly cron, and the cumulative stats view
-- are rewritten in the next migration.

--------------------------------------------------------------------------------
-- 1. Drop challenge-era wiring
--------------------------------------------------------------------------------

-- The finalize cron job calls a function dropped below. A replacement job
-- (weekly period creation + finalize) is scheduled with the new RPCs.
do $cron_teardown$
begin
  if exists (
    select 1 from cron.job where jobname = 'jaringoby-finalize-due-challenges'
  ) then
    perform cron.unschedule('jaringoby-finalize-due-challenges');
  end if;
end
$cron_teardown$;

drop view public.challenge_member_progress;
drop view public.challenge_status_view;

-- Policies on surviving tables that reference challenge helpers or columns.
-- Policies on dropped tables disappear with the tables themselves.
drop policy profiles_select_shared_challenge on public.profiles;
drop policy expenses_read_owner_or_room_members on public.expenses;
drop policy comments_read_room_members on public.comments;
drop policy expense_photos_select_owner_or_room on storage.objects;
drop policy expense_photos_insert_owned_active_path on storage.objects;
drop policy expense_photos_update_owner on storage.objects;
drop policy profile_images_select_self_or_shared_room on storage.objects;

-- Challenge RPC surface. All of these are rebuilt on the room/period model in
-- the follow-up migration (create_room / join_room / add_expense(period) / ...).
drop function public.create_challenge(text, date, date, bigint, smallint, text, uuid);
drop function public.preview_invite(text);
drop function public.join_challenge(text);
drop function public.add_expense(uuid, bigint, public.expense_category, timestamptz, text, text, uuid);
drop function public.update_expense(uuid, bigint, public.expense_category, timestamptz, text, text, integer);
drop function public.delete_expense(uuid, integer);
drop function public.add_comment(uuid, text, uuid, uuid);
drop function public.update_comment(uuid, text, integer);
drop function public.delete_comment(uuid, integer);
drop function public.update_challenge_settings(uuid, text, smallint);
drop function public.rotate_invite_code(uuid);
drop function public.leave_challenge(uuid, uuid);
drop function public.delete_challenge(uuid);
drop function public.finalize_challenge(uuid);

drop function private.create_challenge_impl(text, date, date, bigint, smallint, text, uuid);
drop function private.preview_invite_impl(text);
drop function private.join_challenge_impl(text);
drop function private.add_expense_impl(uuid, bigint, public.expense_category, timestamptz, text, text, uuid);
drop function private.update_expense_impl(uuid, bigint, public.expense_category, timestamptz, text, text, integer);
drop function private.delete_expense_impl(uuid, integer);
drop function private.add_comment_impl(uuid, text, uuid, uuid);
drop function private.update_comment_impl(uuid, text, integer);
drop function private.delete_comment_impl(uuid, integer);
drop function private.update_challenge_settings_impl(uuid, text, smallint);
drop function private.rotate_invite_code_impl(uuid);
drop function private.leave_challenge_impl(uuid, uuid);
drop function private.delete_challenge_impl(uuid);
drop function private.finalize_challenge_for_member_impl(uuid);
drop function private.finalize_challenge_core(uuid);
drop function private.finalize_due_challenges(integer);
-- assert_owned_photo is recreated with a period parameter alongside the RPCs.
drop function private.assert_owned_photo(uuid, uuid, text);
-- enqueue_notification is recreated below with room/period columns.
drop function private.enqueue_notification(uuid, public.notification_kind, uuid, uuid, uuid, uuid, text, text);

-- Surviving tables: detach challenge columns before the tables go away.
-- The photo-required check spans several columns, so it must go explicitly;
-- the FK and the challenge-keyed indexes fall away with the column itself.
alter table public.expenses drop constraint expenses_challenge_photo_required;
alter table public.expenses drop column challenge_id;
alter table public.notifications drop column challenge_id;

drop table public.challenge_member_results;
drop table public.challenge_archives;
drop table public.user_challenge_preferences;
drop table public.challenge_days;
drop table public.challenge_members;
drop table public.invite_codes;
drop table public.challenges;

-- Trigger went away with the challenges table; the function can follow now.
drop function private.protect_challenge_calculation_conditions();
drop function private.is_challenge_member(uuid, uuid);
drop function private.is_active_challenge_member(uuid, uuid);
drop function private.shares_challenge(uuid, uuid);

--------------------------------------------------------------------------------
-- 2. Types
--------------------------------------------------------------------------------

-- Phase names and member roles/statuses carry over unchanged; only the
-- domain they attach to is renamed.
alter type public.challenge_state rename to period_state;
alter type public.challenge_member_role rename to room_member_role;
alter type public.challenge_member_status rename to room_member_status;

alter type public.notification_kind rename value 'challenge_starting' to 'period_starting';
alter type public.notification_kind rename value 'challenge_started' to 'period_started';
alter type public.notification_kind rename value 'challenge_archived' to 'period_archived';

create type public.room_status as enum ('open', 'closed');

--------------------------------------------------------------------------------
-- 3. New tables
--------------------------------------------------------------------------------

-- Rooms hold the fixed settings (D2: weekly base amount, frozen at creation)
-- and own membership + invites. Weekly timelines live on periods.
-- The holiday version is NOT pinned here: rooms are open-ended (반복 종료 무기한)
-- while holiday datasets are published per year, so each period snapshots the
-- version that was current when it was created.
create table public.rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  creator_id uuid not null references public.profiles (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  base_amount bigint not null,
  currency text not null default 'KRW',
  timezone text not null default 'Asia/Seoul',
  -- D1: Mon-Fri fixed (bitmask 62). Column kept for future patterns; the
  -- check pins today's only supported value and is loosened when needed.
  weekday_mask integer not null default 62,
  capacity smallint not null default 10,
  status public.room_status not null default 'open',
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint rooms_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint rooms_base_amount check (base_amount between 1 and 1000000000000),
  constraint rooms_fixed_currency check (currency = 'KRW'),
  constraint rooms_fixed_timezone check (timezone = 'Asia/Seoul'),
  constraint rooms_weekday_mask check (weekday_mask = 62),
  constraint rooms_capacity check (capacity between 1 and 10),
  constraint rooms_status_time check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  ),
  unique (creator_id, client_request_id)
);

create index rooms_owner_idx on public.rooms (owner_id);
create index rooms_open_idx on public.rooms (id) where status = 'open';

-- Persistent membership: one row per user per room, kept across weeks.
-- Leaving flips status; the row (and the member's period history) remains.
create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.room_member_role not null default 'member',
  status public.room_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint room_members_status_time check (
    (status = 'active' and left_at is null)
    or (status <> 'active' and left_at is not null)
  )
);

create unique index room_members_one_owner_idx
  on public.room_members (room_id)
  where role = 'owner' and status = 'active';
create index room_members_user_idx on public.room_members (user_id, room_id);
create index room_members_active_idx
  on public.room_members (room_id)
  where status = 'active';

-- One row per room per week (D1: Mon 00:00 - Fri 24:00 KST). Periods are
-- always full Mon-Fri weeks; per-member proration handles mid-week starts
-- (D3/D6). F = ends_at + 48h lands exactly on the next week's Monday 00:00,
-- which is also when the cron creates the following period (D7).
create table public.periods (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  week_index integer not null,
  week_start date not null,
  week_end date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  correction_ends_at timestamptz not null,
  finalizes_at timestamptz not null,
  selected_day_count smallint not null,
  valid_day_count smallint not null,
  holiday_version_id text not null references public.holiday_calendar_versions (id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periods_week_index check (week_index >= 1),
  constraint periods_week_shape check (
    extract(isodow from week_start) = 1
    and week_end = week_start + 4
  ),
  constraint periods_boundary_order check (
    starts_at < ends_at
    and correction_ends_at = ends_at + interval '12 hours'
    and finalizes_at = ends_at + interval '48 hours'
  ),
  constraint periods_selected_days check (selected_day_count between 1 and 7),
  -- D5: an all-holiday week is still created as a rest week (valid = 0).
  constraint periods_valid_days check (
    valid_day_count between 0 and selected_day_count
  ),
  unique (room_id, week_index),
  unique (room_id, week_start)
);

create index periods_room_idx on public.periods (room_id, week_start desc);
create index periods_finalize_due_idx
  on public.periods (finalizes_at)
  where finalized_at is null;

-- The week's weekdays with holiday flags, resolved from the period's holiday
-- version at creation time. Weekends never appear (평일 전용).
create table public.period_days (
  period_id uuid not null references public.periods (id) on delete cascade,
  day_on date not null,
  is_holiday boolean not null default false,
  holiday_name text,
  created_at timestamptz not null default now(),
  primary key (period_id, day_on),
  constraint period_days_weekday check (extract(isodow from day_on) between 1 and 5),
  constraint period_days_holiday_name check (
    (is_holiday and holiday_name is not null and char_length(btrim(holiday_name)) > 0)
    or (not is_holiday and holiday_name is null)
  )
);

create index period_days_valid_idx
  on public.period_days (period_id, day_on)
  where not is_holiday;

-- Weekly participation, expanded from active room_members when the period is
-- created (D7), or inserted on join/room creation with proration (D3/D6):
-- applied_limit = base_amount * eligible_day_count / selected_day_count.
-- A rest week (D5) yields eligible = 0 and applied_limit = 0.
create table public.period_members (
  period_id uuid not null references public.periods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  status public.room_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  joined_on date not null,
  is_late_join boolean not null default false,
  eligible_day_count smallint not null,
  applied_limit bigint not null,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_id, user_id),
  constraint period_members_eligible_days check (eligible_day_count between 0 and 7),
  constraint period_members_applied_limit check (applied_limit >= 0),
  constraint period_members_status_time check (
    (status = 'active' and left_at is null)
    or (status <> 'active' and left_at is not null)
  )
);

create index period_members_user_idx on public.period_members (user_id, period_id);

-- Per-member settlement snapshot written at F (기존 finalize 로직 재사용).
-- room_id is denormalized so the cumulative stats view (D4: streak, achieved
-- weeks, crowns) can aggregate room x user without touching periods.
-- Period-level facts (overall success, crowns) are derivable from these rows,
-- and the calculation conditions live on in periods/period_days, so there is
-- no separate archive table.
create table public.period_results (
  period_id uuid not null references public.periods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  room_id uuid not null references public.rooms (id) on delete cascade,
  nickname_snapshot text not null,
  status_snapshot public.room_member_status not null,
  joined_on date not null,
  eligible_day_count smallint not null,
  applied_limit bigint not null,
  spent_amount bigint not null,
  remaining_amount bigint not null,
  achieved boolean not null,
  is_crown boolean not null,
  finalized_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (period_id, user_id)
);

create index period_results_room_user_idx
  on public.period_results (room_id, user_id, period_id);

-- Invites attach to the room (방 단위 초대). Rooms are open-ended, so codes
-- may live until the room closes (expires_at null = no expiry).
create table public.invite_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  code text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_codes_format check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
  constraint invite_codes_revoke_consistency check (
    (is_active and revoked_at is null) or (not is_active and revoked_at is not null)
  ),
  unique (code)
);

create unique index invite_codes_one_active_per_room_idx
  on public.invite_codes (room_id)
  where is_active;
create index invite_codes_lookup_idx
  on public.invite_codes (code, is_active, expires_at);

create table public.user_room_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  is_hidden boolean not null default false,
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

-- Expenses now attach to a specific week. Personal expenses keep period_id null.
alter table public.expenses
  add column period_id uuid references public.periods (id) on delete restrict;
alter table public.expenses
  add constraint expenses_period_photo_required check (
    period_id is null or (photo_path is not null and photo_uploaded_at is not null)
  );

create index expenses_period_feed_idx
  on public.expenses (period_id, created_at desc)
  where period_id is not null and deleted_at is null;
create index expenses_period_totals_idx
  on public.expenses (period_id, user_id)
  include (amount)
  where deleted_at is null and excluded_at is null;

alter table public.notifications
  add column room_id uuid references public.rooms (id) on delete cascade,
  add column period_id uuid references public.periods (id) on delete cascade;

--------------------------------------------------------------------------------
-- 4. Triggers
--------------------------------------------------------------------------------

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function private.set_updated_at();

create trigger room_members_set_updated_at
before update on public.room_members
for each row execute function private.set_updated_at();

create trigger periods_set_updated_at
before update on public.periods
for each row execute function private.set_updated_at();

create trigger period_members_set_updated_at
before update on public.period_members
for each row execute function private.set_updated_at();

create trigger user_room_preferences_set_updated_at
before update on public.user_room_preferences
for each row execute function private.set_updated_at();

-- D2: the limit inputs are frozen at room creation. Ownership transfer and
-- closing go through server RPCs (security definer functions run as postgres).
create function private.protect_room_calculation_conditions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
      old.creator_id, old.base_amount, old.currency, old.timezone,
      old.weekday_mask, old.client_request_id
    ) is distinct from row(
      new.creator_id, new.base_amount, new.currency, new.timezone,
      new.weekday_mask, new.client_request_id
    ) then
    raise exception using errcode = '22023', message = 'room calculation conditions are immutable';
  end if;

  if new.capacity < old.capacity then
    raise exception using errcode = '22023', message = 'room capacity can only increase';
  end if;

  if old.owner_id is distinct from new.owner_id and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'room ownership must be transferred through the server RPC';
  end if;

  if (old.status is distinct from new.status or old.closed_at is distinct from new.closed_at)
     and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'room closing is server-managed';
  end if;

  return new;
end;
$$;

create trigger rooms_protect_calculation_conditions
before update on public.rooms
for each row execute function private.protect_room_calculation_conditions();

-- A period's timeline and day counts never change after creation; only
-- finalized_at is stamped by the server.
create function private.protect_period_calculation_conditions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
      old.room_id, old.week_index, old.week_start, old.week_end,
      old.starts_at, old.ends_at, old.correction_ends_at, old.finalizes_at,
      old.selected_day_count, old.valid_day_count, old.holiday_version_id
    ) is distinct from row(
      new.room_id, new.week_index, new.week_start, new.week_end,
      new.starts_at, new.ends_at, new.correction_ends_at, new.finalizes_at,
      new.selected_day_count, new.valid_day_count, new.holiday_version_id
    ) then
    raise exception using errcode = '22023', message = 'period calculation conditions are immutable';
  end if;

  if old.finalized_at is distinct from new.finalized_at and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'period finalization is server-managed';
  end if;

  return new;
end;
$$;

create trigger periods_protect_calculation_conditions
before update on public.periods
for each row execute function private.protect_period_calculation_conditions();

--------------------------------------------------------------------------------
-- 5. Authorization helpers
--------------------------------------------------------------------------------

-- Same contract as the challenge-era helpers: any membership row grants read
-- access to history; active membership gates writes.
create function private.is_room_member(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = p_user_id
  );
$$;

create function private.is_active_room_member(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = p_user_id
      and m.status = 'active'
  );
$$;

create function private.is_period_room_member(
  p_period_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.periods per
    join public.room_members m on m.room_id = per.room_id
    where per.id = p_period_id
      and m.user_id = p_user_id
  );
$$;

create function private.is_active_period_member(
  p_period_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.period_members pm
    where pm.period_id = p_period_id
      and pm.user_id = p_user_id
      and pm.status = 'active'
  );
$$;

create function private.shares_room(
  p_left_user_id uuid,
  p_right_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_left_user_id is not null
    and p_right_user_id is not null
    and exists (
      select 1
      from public.room_members left_member
      join public.room_members right_member
        on right_member.room_id = left_member.room_id
      where left_member.user_id = p_left_user_id
        and right_member.user_id = p_right_user_id
    );
$$;

create function private.enqueue_notification(
  p_user_id uuid,
  p_kind public.notification_kind,
  p_actor_id uuid,
  p_room_id uuid,
  p_period_id uuid,
  p_expense_id uuid,
  p_comment_id uuid,
  p_route text,
  p_dedupe_key text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notifications (
    user_id, kind, actor_id, room_id, period_id, expense_id, comment_id,
    route, dedupe_key
  )
  select
    p_user_id, p_kind, p_actor_id, p_room_id, p_period_id, p_expense_id,
    p_comment_id, p_route, p_dedupe_key
  where p_user_id is not null
    and p_user_id is distinct from p_actor_id
  on conflict (user_id, dedupe_key) do nothing;
$$;

--------------------------------------------------------------------------------
-- 6. Views
--------------------------------------------------------------------------------

-- Phase is derived from server boundaries exactly as before
-- (WAITING -> ACTIVE -> ADJUSTMENT -> SETTLEMENT(settling) -> ARCHIVED).
create view public.period_status_view
with (security_invoker = true)
as
select
  p.id,
  p.room_id,
  p.week_index,
  p.week_start,
  p.week_end,
  p.starts_at,
  p.ends_at,
  p.correction_ends_at,
  p.finalizes_at,
  p.selected_day_count,
  p.valid_day_count,
  p.holiday_version_id,
  p.finalized_at,
  p.created_at,
  p.updated_at,
  case
    when statement_timestamp() < p.starts_at then 'waiting'::public.period_state
    when statement_timestamp() < p.ends_at then 'active'::public.period_state
    when statement_timestamp() < p.correction_ends_at then 'adjustment'::public.period_state
    when statement_timestamp() < p.finalizes_at then 'settling'::public.period_state
    else 'archived'::public.period_state
  end as state
from public.periods p;

create view public.period_member_progress
with (security_invoker = true)
as
with member_spend as (
  select
    pm.period_id,
    per.room_id,
    pm.user_id,
    p.nickname,
    p.avatar_path,
    rm.role,
    pm.status,
    pm.joined_at,
    pm.joined_on,
    pm.is_late_join,
    pm.eligible_day_count,
    pm.applied_limit,
    coalesce(sum(e.amount) filter (
      where e.deleted_at is null and e.excluded_at is null
    ), 0)::bigint as spent_amount
  from public.period_members pm
  join public.periods per on per.id = pm.period_id
  join public.profiles p on p.id = pm.user_id
  left join public.room_members rm
    on rm.room_id = per.room_id
   and rm.user_id = pm.user_id
  left join public.expenses e
    on e.period_id = pm.period_id
   and e.user_id = pm.user_id
  group by pm.period_id, pm.user_id, per.id, p.id, rm.room_id, rm.user_id
), progress as (
  select
    ms.*,
    ms.applied_limit - ms.spent_amount as remaining_amount
  from member_spend ms
)
select
  p.*,
  case
    when p.applied_limit = 0 and p.spent_amount = 0 then 0::numeric
    when p.applied_limit = 0 then null::numeric
    else round((p.spent_amount::numeric * 100) / p.applied_limit, 2)
  end as progress_percent,
  p.spent_amount <= p.applied_limit as achieved,
  p.status = 'active'
    and p.remaining_amount = max(p.remaining_amount) filter (
      where p.status = 'active'
    ) over (partition by p.period_id) as is_crown
from progress p;

--------------------------------------------------------------------------------
-- 7. Row-level security
--------------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.periods enable row level security;
alter table public.period_days enable row level security;
alter table public.period_members enable row level security;
alter table public.period_results enable row level security;
alter table public.invite_codes enable row level security;
alter table public.user_room_preferences enable row level security;

create policy profiles_select_shared_room
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.shares_room((select auth.uid()), id)
);

create policy rooms_read_members
on public.rooms
for select
to authenticated
using (private.is_room_member(id, (select auth.uid())));

create policy room_members_read_room_members
on public.room_members
for select
to authenticated
using (private.is_room_member(room_id, (select auth.uid())));

create policy periods_read_members
on public.periods
for select
to authenticated
using (private.is_room_member(room_id, (select auth.uid())));

create policy period_days_read_members
on public.period_days
for select
to authenticated
using (private.is_period_room_member(period_id, (select auth.uid())));

create policy period_members_read_room_members
on public.period_members
for select
to authenticated
using (private.is_period_room_member(period_id, (select auth.uid())));

create policy period_results_read_members
on public.period_results
for select
to authenticated
using (private.is_room_member(room_id, (select auth.uid())));

create policy invite_codes_read_active_members
on public.invite_codes
for select
to authenticated
using (private.is_active_room_member(room_id, (select auth.uid())));

create policy expenses_read_owner_or_room_members
on public.expenses
for select
to authenticated
using (
  (period_id is null and user_id = (select auth.uid()))
  or (
    period_id is not null
    and private.is_period_room_member(period_id, (select auth.uid()))
  )
);

create policy comments_read_room_members
on public.comments
for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = comments.expense_id
      and e.period_id is not null
      and private.is_period_room_member(e.period_id, (select auth.uid()))
  )
);

create policy room_preferences_read_self
on public.user_room_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

create policy room_preferences_insert_self_member
on public.user_room_preferences
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_room_member(room_id, (select auth.uid()))
);

create policy room_preferences_update_self_member
on public.user_room_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and private.is_room_member(room_id, (select auth.uid()))
);

create policy room_preferences_delete_self
on public.user_room_preferences
for delete
to authenticated
using (user_id = (select auth.uid()));

--------------------------------------------------------------------------------
-- 8. Storage policies
--------------------------------------------------------------------------------

-- Photo paths move from {challenge-id|personal}/... to {period-id|personal}/...
create policy expense_photos_select_owner_or_room
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-photos'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1
      from public.expenses e
      where e.photo_path = storage.objects.name
        and e.deleted_at is null
        and (
          e.user_id = (select auth.uid())
          or (
            e.period_id is not null
            and private.is_period_room_member(e.period_id, (select auth.uid()))
          )
        )
    )
  )
);

create policy expense_photos_insert_owned_active_path
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-photos'
  and name !~ '(^/|\.\.)'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and split_part(name, '/', 3) <> ''
  and (
    split_part(name, '/', 1) = 'personal'
    or exists (
      select 1
      from public.periods per
      where per.id::text = split_part(storage.objects.name, '/', 1)
        and statement_timestamp() >= per.starts_at
        and statement_timestamp() < per.correction_ends_at
        and private.is_active_period_member(per.id, (select auth.uid()))
    )
  )
);

create policy expense_photos_update_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-photos'
  and owner_id = (select auth.uid())::text
  and not exists (
    select 1
    from public.expenses e
    where e.photo_path = storage.objects.name
      and e.deleted_at is null
  )
)
with check (
  bucket_id = 'expense-photos'
  and owner_id = (select auth.uid())::text
  and name !~ '(^/|\.\.)'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and (
    split_part(name, '/', 1) = 'personal'
    or exists (
      select 1
      from public.periods per
      where per.id::text = split_part(storage.objects.name, '/', 1)
        and statement_timestamp() >= per.starts_at
        and statement_timestamp() < per.correction_ends_at
        and private.is_active_period_member(per.id, (select auth.uid()))
    )
  )
);

create policy profile_images_select_self_or_shared_room
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1
      from public.profiles p
      where p.id::text = split_part(storage.objects.name, '/', 1)
        and private.shares_room((select auth.uid()), p.id)
    )
  )
);

--------------------------------------------------------------------------------
-- 9. Grants
--------------------------------------------------------------------------------

revoke all on table
  public.rooms,
  public.room_members,
  public.periods,
  public.period_days,
  public.period_members,
  public.period_results,
  public.invite_codes,
  public.user_room_preferences
from public, anon, service_role;

grant select on table
  public.rooms,
  public.room_members,
  public.periods,
  public.period_days,
  public.period_members,
  public.period_results,
  public.invite_codes,
  public.user_room_preferences
to authenticated;

grant insert (user_id, room_id, is_hidden, notifications_enabled)
  on public.user_room_preferences to authenticated;
grant update (is_hidden, notifications_enabled)
  on public.user_room_preferences to authenticated;
grant delete on public.user_room_preferences to authenticated;

revoke all on table public.period_status_view, public.period_member_progress
from public, anon, service_role;
grant select on table public.period_status_view, public.period_member_progress
to authenticated;

-- Functions in the private schema default to PUBLIC execute; lock the new ones
-- down and re-grant only what RLS policies evaluate as the calling user.
revoke execute on all functions in schema private
from public, anon, authenticated, service_role;

grant execute on function private.is_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_active_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_period_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_active_period_member(uuid, uuid) to authenticated;
grant execute on function private.shares_room(uuid, uuid) to authenticated;

--------------------------------------------------------------------------------
-- 10. Realtime
--------------------------------------------------------------------------------

-- Dropped challenge tables left the publication automatically; expenses,
-- comments and notifications remain from the initial migration.
do $realtime_setup$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'rooms',
      'room_members',
      'periods',
      'period_members',
      'period_results'
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
