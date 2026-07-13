-- Jaringoby initial backend schema
-- PostgreSQL 17 / Supabase, Asia/Seoul, KRW

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- Supabase's 2026 Data API defaults make exposure opt-in. Keep that invariant
-- explicit for all objects created by future migrations as well.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create type public.challenge_state as enum (
  'waiting',
  'active',
  'adjustment',
  'settling',
  'archived'
);

create type public.challenge_member_role as enum ('owner', 'member');
create type public.challenge_member_status as enum (
  'active',
  'left',
  'removed',
  'account_deleted'
);

create type public.expense_category as enum (
  'lunch',
  'coffee',
  'snack',
  'dinner',
  'essential',
  'luxury'
);

create type public.report_target_type as enum ('profile', 'expense', 'comment');
create type public.report_reason as enum (
  'harassment',
  'hate_or_abuse',
  'personal_information',
  'inappropriate_image',
  'spam',
  'other'
);
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create type public.notification_kind as enum (
  'challenge_starting',
  'challenge_started',
  'member_joined',
  'capacity_full',
  'expense_comment',
  'comment_reply',
  'limit_50',
  'limit_80',
  'limit_100',
  'adjustment_started',
  'adjustment_deadline_soon',
  'settling_started',
  'challenge_archived',
  'upload_failed'
);

create type public.push_platform as enum ('ios', 'android');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  avatar_path text,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_length
    check (char_length(btrim(nickname)) between 2 and 20),
  constraint profiles_nickname_not_blank check (nickname ~ '[^[:space:]]'),
  constraint profiles_avatar_path_safe
    check (
      avatar_path is null
      or (
        avatar_path !~ '(^/|\\.\\.)'
        and char_length(avatar_path) <= 512
        and split_part(avatar_path, '/', 1) = id::text
        and split_part(avatar_path, '/', 2) <> ''
      )
    )
);

create table public.holiday_calendar_versions (
  id text primary key,
  country_code text not null default 'KR',
  source_name text not null,
  coverage_start date not null,
  coverage_end date not null,
  published_at timestamptz not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint holiday_versions_country_kr check (country_code = 'KR'),
  constraint holiday_versions_coverage check (coverage_start <= coverage_end),
  constraint holiday_versions_id_length check (char_length(id) between 1 and 80)
);

create unique index holiday_calendar_one_current_idx
  on public.holiday_calendar_versions (is_current)
  where is_current;

create table public.korean_holidays (
  version_id text not null references public.holiday_calendar_versions (id) on delete cascade,
  holiday_on date not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (version_id, holiday_on),
  constraint korean_holidays_name_length check (char_length(btrim(name)) between 1 and 100)
);

create index korean_holidays_date_idx
  on public.korean_holidays (holiday_on, version_id);

create table public.challenges (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  creator_id uuid not null references public.profiles (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  start_on date not null,
  end_on date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  correction_ends_at timestamptz not null,
  finalizes_at timestamptz not null,
  base_amount bigint not null,
  currency text not null default 'KRW',
  timezone text not null default 'Asia/Seoul',
  capacity smallint not null,
  selected_day_count smallint not null,
  valid_day_count smallint not null,
  holiday_version_id text not null references public.holiday_calendar_versions (id) on delete restrict,
  client_request_id uuid not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint challenges_period check (end_on >= start_on and end_on - start_on between 0 and 30),
  constraint challenges_boundary_order check (
    starts_at < ends_at
    and correction_ends_at = ends_at + interval '12 hours'
    and finalizes_at = ends_at + interval '48 hours'
  ),
  constraint challenges_base_amount check (base_amount between 1 and 1000000000000),
  constraint challenges_fixed_currency check (currency = 'KRW'),
  constraint challenges_fixed_timezone check (timezone = 'Asia/Seoul'),
  constraint challenges_capacity check (capacity between 1 and 10),
  constraint challenges_selected_days check (
    selected_day_count between 1 and 31
    and selected_day_count = end_on - start_on + 1
  ),
  constraint challenges_valid_days check (valid_day_count between 1 and selected_day_count),
  unique (creator_id, client_request_id)
);

create index challenges_owner_idx on public.challenges (owner_id);
create index challenges_boundaries_idx
  on public.challenges (starts_at, ends_at, correction_ends_at, finalizes_at);
create index challenges_finalize_due_idx
  on public.challenges (finalizes_at)
  where finalized_at is null;

create table public.challenge_days (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  challenge_on date not null,
  is_holiday boolean not null,
  holiday_name text,
  created_at timestamptz not null default now(),
  primary key (challenge_id, challenge_on),
  constraint challenge_days_holiday_name check (
    (is_holiday and holiday_name is not null and char_length(btrim(holiday_name)) > 0)
    or (not is_holiday and holiday_name is null)
  )
);

create index challenge_days_valid_idx
  on public.challenge_days (challenge_id, challenge_on)
  where not is_holiday;

create table public.challenge_members (
  id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.challenge_member_role not null default 'member',
  status public.challenge_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  joined_on date not null,
  eligible_day_count smallint not null,
  applied_limit bigint not null,
  is_late_join boolean not null,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_members_eligible_days check (eligible_day_count between 1 and 31),
  constraint challenge_members_applied_limit check (applied_limit >= 0),
  constraint challenge_members_status_time check (
    (status = 'active' and left_at is null)
    or (status <> 'active' and left_at is not null)
  ),
  unique (challenge_id, user_id)
);

create unique index challenge_members_one_owner_idx
  on public.challenge_members (challenge_id)
  where role = 'owner' and status = 'active';
create index challenge_members_user_idx
  on public.challenge_members (user_id, challenge_id);
create index challenge_members_active_idx
  on public.challenge_members (challenge_id, joined_at)
  where status = 'active';

create table public.invite_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  code text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_codes_format check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
  constraint invite_codes_revoke_consistency check (
    (is_active and revoked_at is null) or (not is_active and revoked_at is not null)
  ),
  unique (code)
);

create unique index invite_codes_one_active_per_challenge_idx
  on public.invite_codes (challenge_id)
  where is_active;
create index invite_codes_lookup_idx
  on public.invite_codes (code, is_active, expires_at);

create table public.expenses (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  challenge_id uuid references public.challenges (id) on delete restrict,
  amount bigint not null,
  category public.expense_category not null,
  occurred_at timestamptz not null,
  memo text,
  photo_path text,
  photo_uploaded_at timestamptz,
  client_request_id uuid not null,
  version integer not null default 1,
  edited_at timestamptz,
  deleted_at timestamptz,
  excluded_at timestamptz,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount check (amount between 1 and 1000000000000),
  constraint expenses_memo_length check (memo is null or char_length(memo) <= 500),
  constraint expenses_photo_path_safe check (
    photo_path is null or (photo_path !~ '(^/|\\.\\.)' and char_length(photo_path) <= 1024)
  ),
  constraint expenses_challenge_photo_required check (
    challenge_id is null or (photo_path is not null and photo_uploaded_at is not null)
  ),
  constraint expenses_version_positive check (version >= 1),
  constraint expenses_exclusion_consistency check (
    (excluded_at is null and exclusion_reason is null)
    or (excluded_at is not null and exclusion_reason is not null)
  ),
  unique (user_id, client_request_id)
);

create unique index expenses_photo_path_unique_idx
  on public.expenses (photo_path)
  where photo_path is not null;
create index expenses_user_occurred_idx
  on public.expenses (user_id, occurred_at desc)
  where deleted_at is null;
create index expenses_challenge_feed_idx
  on public.expenses (challenge_id, created_at desc)
  where challenge_id is not null and deleted_at is null;
create index expenses_challenge_totals_idx
  on public.expenses (challenge_id, user_id)
  include (amount)
  where deleted_at is null and excluded_at is null;

create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  reply_to_comment_id uuid references public.comments (id) on delete restrict,
  body text,
  client_request_id uuid not null,
  version integer not null default 1,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_state check (
    (deleted_at is null and body is not null and char_length(btrim(body)) between 1 and 500)
    or (deleted_at is not null and body is null)
  ),
  constraint comments_version_positive check (version >= 1),
  constraint comments_not_self_reply check (reply_to_comment_id is null or reply_to_comment_id <> id),
  unique (user_id, client_request_id)
);

create index comments_expense_order_idx
  on public.comments (expense_id, created_at, id);
create index comments_reply_idx
  on public.comments (reply_to_comment_id)
  where reply_to_comment_id is not null;

create table public.challenge_archives (
  challenge_id uuid primary key references public.challenges (id) on delete cascade,
  conditions_snapshot jsonb not null,
  overall_success boolean not null,
  crown_user_ids uuid[] not null default '{}',
  locked_at timestamptz not null,
  finalized_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.challenge_member_results (
  challenge_id uuid not null references public.challenge_archives (challenge_id) on delete cascade,
  member_id uuid not null references public.challenge_members (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  nickname_snapshot text not null,
  status_snapshot public.challenge_member_status not null,
  joined_at timestamptz not null,
  joined_on date not null,
  eligible_day_count smallint not null,
  applied_limit bigint not null,
  spent_amount bigint not null,
  remaining_amount bigint not null,
  achieved boolean not null,
  is_crown boolean not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, member_id)
);

create index challenge_member_results_user_idx
  on public.challenge_member_results (user_id, challenge_id);

create table public.user_challenge_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  is_hidden boolean not null default false,
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create table public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete restrict,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_details_length check (details is null or char_length(details) <= 1000),
  constraint reports_status_time check (
    (status in ('open', 'reviewing') and resolved_at is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  )
);

create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_queue_idx on public.reports (status, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  actor_id uuid references public.profiles (id) on delete set null,
  challenge_id uuid references public.challenges (id) on delete cascade,
  expense_id uuid references public.expenses (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  route text not null,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_route_length check (char_length(route) between 1 and 512),
  constraint notifications_dedupe_length check (char_length(dedupe_key) between 1 and 200),
  unique (user_id, dedupe_key)
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create table public.device_push_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform public.push_platform not null,
  token text not null,
  device_id text,
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_token_length check (char_length(token) between 16 and 4096),
  constraint device_push_tokens_device_id_length check (
    device_id is null or char_length(device_id) between 1 and 200
  ),
  unique (token)
);

create unique index device_push_tokens_user_device_idx
  on public.device_push_tokens (user_id, platform, device_id)
  where device_id is not null;
create index device_push_tokens_delivery_idx
  on public.device_push_tokens (user_id, platform)
  where is_enabled;

create table private.invite_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  normalized_code text not null,
  was_successful boolean not null,
  attempted_at timestamptz not null default now()
);

create index invite_code_attempts_rate_idx
  on private.invite_code_attempts (user_id, attempted_at desc);

create table private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx
  on private.audit_events (entity_type, entity_id, created_at desc);

-- Generic timestamps and immutable calculation conditions.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger challenges_set_updated_at
before update on public.challenges
for each row execute function private.set_updated_at();

create trigger challenge_members_set_updated_at
before update on public.challenge_members
for each row execute function private.set_updated_at();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function private.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function private.set_updated_at();

create trigger user_challenge_preferences_set_updated_at
before update on public.user_challenge_preferences
for each row execute function private.set_updated_at();

create trigger device_push_tokens_set_updated_at
before update on public.device_push_tokens
for each row execute function private.set_updated_at();

create function private.protect_challenge_calculation_conditions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
      old.creator_id, old.start_on, old.end_on, old.starts_at, old.ends_at,
      old.correction_ends_at, old.finalizes_at, old.base_amount, old.currency,
      old.timezone, old.selected_day_count, old.valid_day_count,
      old.holiday_version_id, old.client_request_id
    ) is distinct from row(
      new.creator_id, new.start_on, new.end_on, new.starts_at, new.ends_at,
      new.correction_ends_at, new.finalizes_at, new.base_amount, new.currency,
      new.timezone, new.selected_day_count, new.valid_day_count,
      new.holiday_version_id, new.client_request_id
    ) then
    raise exception using errcode = '22023', message = 'challenge calculation conditions are immutable';
  end if;

  if new.capacity < old.capacity then
    raise exception using errcode = '22023', message = 'challenge capacity can only increase';
  end if;

  if old.owner_id is distinct from new.owner_id and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'challenge ownership must be transferred through the server RPC';
  end if;

  if old.finalized_at is distinct from new.finalized_at and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'challenge finalization is server-managed';
  end if;

  return new;
end;
$$;

create trigger challenges_protect_calculation_conditions
before update on public.challenges
for each row execute function private.protect_challenge_calculation_conditions();

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nickname text;
begin
  v_nickname := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '사용자'));
  if char_length(v_nickname) not between 2 and 20 then
    v_nickname := '사용자';
  end if;

  insert into public.profiles (id, nickname)
  values (new.id, v_nickname)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- RLS helper functions live outside exposed schemas. They intentionally bypass
-- RLS only for small authorization lookups and never trust user metadata.
create function private.is_challenge_member(
  p_challenge_id uuid,
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
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_user_id
  );
$$;

create function private.is_active_challenge_member(
  p_challenge_id uuid,
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
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_user_id
      and m.status = 'active'
  );
$$;

create function private.shares_challenge(
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
      from public.challenge_members left_member
      join public.challenge_members right_member
        on right_member.challenge_id = left_member.challenge_id
      where left_member.user_id = p_left_user_id
        and right_member.user_id = p_right_user_id
    );
$$;

create function private.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_bytes bytea;
  v_attempt integer;
  v_i integer;
begin
  for v_attempt in 1..50 loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for v_i in 0..5 loop
      v_code := v_code || substr(
        v_alphabet,
        (get_byte(v_bytes, v_i) % char_length(v_alphabet)) + 1,
        1
      );
    end loop;

    if not exists (select 1 from public.invite_codes i where i.code = v_code) then
      return v_code;
    end if;
  end loop;

  raise exception using errcode = '54000', message = 'unable to allocate a unique invite code';
end;
$$;

create function private.assert_owned_photo(
  p_user_id uuid,
  p_challenge_id uuid,
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

  v_expected_first_folder := coalesce(p_challenge_id::text, 'personal');
  if split_part(p_photo_path, '/', 1) <> v_expected_first_folder
     or split_part(p_photo_path, '/', 2) <> p_user_id::text
     or split_part(p_photo_path, '/', 3) = '' then
    raise exception using errcode = '22023', message = 'photo path does not match the user and challenge';
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

create function private.write_audit_event(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.audit_events (actor_id, action, entity_type, entity_id, details)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create function private.enqueue_notification(
  p_user_id uuid,
  p_kind public.notification_kind,
  p_actor_id uuid,
  p_challenge_id uuid,
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
    user_id, kind, actor_id, challenge_id, expense_id, comment_id,
    route, dedupe_key
  )
  select
    p_user_id, p_kind, p_actor_id, p_challenge_id, p_expense_id,
    p_comment_id, p_route, p_dedupe_key
  where p_user_id is not null
    and p_user_id is distinct from p_actor_id
  on conflict (user_id, dedupe_key) do nothing;
$$;

-- Atomic challenge creation. Holiday data is always copied from a published
-- server-side version, never accepted from a client payload.
create function private.create_challenge_impl(
  p_name text,
  p_start_on date,
  p_end_on date,
  p_base_amount bigint,
  p_capacity smallint,
  p_holiday_version text,
  p_client_request_id uuid
)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.holiday_calendar_versions%rowtype;
  v_challenge public.challenges%rowtype;
  v_selected_count integer;
  v_holiday_count integer;
  v_valid_count integer;
  v_today date := timezone('Asia/Seoul', now())::date;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_code text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id is required';
  end if;

  select c.* into v_challenge
  from public.challenges c
  where c.creator_id = v_user_id
    and c.client_request_id = p_client_request_id;
  if found then
    return v_challenge;
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'challenge name must be 1 to 40 characters';
  end if;
  if p_start_on is null or p_end_on is null
     or p_end_on < p_start_on
     or p_end_on - p_start_on not between 0 and 30 then
    raise exception using errcode = '22023', message = 'challenge period must contain 1 to 31 inclusive dates';
  end if;
  if p_start_on < v_today then
    raise exception using errcode = '22023', message = 'challenge start date cannot be in the past';
  end if;
  if p_base_amount not between 1 and 1000000000000 then
    raise exception using errcode = '22023', message = 'base amount is outside the supported KRW range';
  end if;
  if p_capacity not between 1 and 10 then
    raise exception using errcode = '22023', message = 'capacity must be between 1 and 10';
  end if;

  if p_holiday_version is null then
    select hv.* into v_version
    from public.holiday_calendar_versions hv
    where hv.is_current
    order by hv.published_at desc
    limit 1;
  else
    select hv.* into v_version
    from public.holiday_calendar_versions hv
    where hv.id = p_holiday_version;
  end if;

  if v_version.id is null then
    raise exception using errcode = '22023', message = 'a published Korean holiday dataset is required';
  end if;
  if p_start_on < v_version.coverage_start or p_end_on > v_version.coverage_end then
    raise exception using errcode = '22023', message = 'the holiday dataset does not cover the selected period';
  end if;

  v_selected_count := p_end_on - p_start_on + 1;
  select count(*)::integer into v_holiday_count
  from public.korean_holidays h
  where h.version_id = v_version.id
    and h.holiday_on between p_start_on and p_end_on;
  v_valid_count := v_selected_count - v_holiday_count;

  if v_valid_count <= 0 then
    raise exception using errcode = '22023', message = 'a challenge must contain at least one non-holiday date';
  end if;

  insert into public.profiles (id, nickname)
  values (v_user_id, '사용자')
  on conflict (id) do nothing;

  v_starts_at := p_start_on::timestamp at time zone 'Asia/Seoul';
  v_ends_at := (p_end_on + 1)::timestamp at time zone 'Asia/Seoul';

  insert into public.challenges (
    name, creator_id, owner_id, start_on, end_on, starts_at, ends_at,
    correction_ends_at, finalizes_at, base_amount, capacity,
    selected_day_count, valid_day_count, holiday_version_id,
    client_request_id
  ) values (
    btrim(p_name), v_user_id, v_user_id, p_start_on, p_end_on,
    v_starts_at, v_ends_at, v_ends_at + interval '12 hours',
    v_ends_at + interval '48 hours', p_base_amount, p_capacity,
    v_selected_count, v_valid_count, v_version.id, p_client_request_id
  )
  on conflict (creator_id, client_request_id) do nothing
  returning * into v_challenge;

  if v_challenge.id is null then
    select c.* into strict v_challenge
    from public.challenges c
    where c.creator_id = v_user_id
      and c.client_request_id = p_client_request_id;
    return v_challenge;
  end if;

  insert into public.challenge_days (
    challenge_id, challenge_on, is_holiday, holiday_name
  )
  select
    v_challenge.id,
    day_value::date,
    h.holiday_on is not null,
    h.name
  from generate_series(
    p_start_on::timestamp,
    p_end_on::timestamp,
    interval '1 day'
  ) as day_value
  left join public.korean_holidays h
    on h.version_id = v_version.id
   and h.holiday_on = day_value::date;

  insert into public.challenge_members (
    challenge_id, user_id, role, status, joined_at, joined_on,
    eligible_day_count, applied_limit, is_late_join
  ) values (
    v_challenge.id, v_user_id, 'owner', 'active', now(), v_today,
    v_valid_count,
    (p_base_amount * v_valid_count) / v_selected_count,
    false
  );

  v_code := private.generate_invite_code();
  insert into public.invite_codes (
    challenge_id, code, created_by, expires_at
  ) values (
    v_challenge.id, v_code, v_user_id, v_ends_at
  );

  perform private.write_audit_event(
    v_user_id,
    'challenge.created',
    'challenge',
    v_challenge.id,
    jsonb_build_object(
      'selected_day_count', v_selected_count,
      'valid_day_count', v_valid_count,
      'holiday_version_id', v_version.id
    )
  );

  return v_challenge;
end;
$$;

create function public.create_challenge(
  p_name text,
  p_start_on date,
  p_end_on date,
  p_base_amount bigint,
  p_capacity smallint,
  p_holiday_version text,
  p_client_request_id uuid
)
returns public.challenges
language sql
security invoker
set search_path = ''
as $$
  select private.create_challenge_impl(
    p_name,
    p_start_on,
    p_end_on,
    p_base_amount,
    p_capacity,
    p_holiday_version,
    p_client_request_id
  );
$$;

create function private.invite_lookup_is_rate_limited(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)
    from private.invite_code_attempts a
    where a.user_id = p_user_id
      and not a.was_successful
      and a.attempted_at > now() - interval '10 minutes'
  ) >= 20;
$$;

create function private.preview_invite_impl(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := left(upper(btrim(coalesce(p_invite_code, ''))), 32);
  v_invite public.invite_codes%rowtype;
  v_challenge public.challenges%rowtype;
  v_joined_on date := timezone('Asia/Seoul', now())::date;
  v_effective_join_on date;
  v_eligible integer;
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
    and i.expires_at > now();

  if v_invite.id is null then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  end if;

  select c.* into strict v_challenge
  from public.challenges c
  where c.id = v_invite.challenge_id;

  if now() >= v_challenge.ends_at then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'CHALLENGE_CLOSED');
  end if;

  v_effective_join_on := greatest(v_joined_on, v_challenge.start_on);
  select count(*)::integer into v_eligible
  from public.challenge_days d
  where d.challenge_id = v_challenge.id
    and not d.is_holiday
    and d.challenge_on >= v_effective_join_on;

  select count(*)::integer into v_member_count
  from public.challenge_members m
  where m.challenge_id = v_challenge.id
    and m.status = 'active';

  insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
  values (v_user_id, v_code, true);

  return jsonb_build_object(
    'ok', true,
    'challenge', jsonb_build_object(
      'id', v_challenge.id,
      'name', v_challenge.name,
      'start_on', v_challenge.start_on,
      'end_on', v_challenge.end_on,
      'starts_at', v_challenge.starts_at,
      'ends_at', v_challenge.ends_at,
      'base_amount', v_challenge.base_amount,
      'currency', v_challenge.currency,
      'timezone', v_challenge.timezone,
      'capacity', v_challenge.capacity,
      'member_count', v_member_count,
      'selected_day_count', v_challenge.selected_day_count,
      'valid_day_count', v_challenge.valid_day_count,
      'holiday_version_id', v_challenge.holiday_version_id
    ),
    'join', jsonb_build_object(
      'joined_on', v_joined_on,
      'eligible_day_count', v_eligible,
      'applied_limit', case
        when v_eligible > 0
          then (v_challenge.base_amount * v_eligible) / v_challenge.selected_day_count
        else 0
      end,
      'is_late_join', now() >= v_challenge.starts_at,
      'can_join', v_eligible > 0 and v_member_count < v_challenge.capacity
    ),
    'holidays', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('date', d.challenge_on, 'name', d.holiday_name)
          order by d.challenge_on
        ),
        '[]'::jsonb
      )
      from public.challenge_days d
      where d.challenge_id = v_challenge.id
        and d.is_holiday
    )
  );
end;
$$;

create function public.preview_invite(p_invite_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.preview_invite_impl(p_invite_code);
$$;

create function private.join_challenge_impl(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := left(upper(btrim(coalesce(p_invite_code, ''))), 32);
  v_invite public.invite_codes%rowtype;
  v_challenge public.challenges%rowtype;
  v_existing public.challenge_members%rowtype;
  v_member public.challenge_members%rowtype;
  v_joined_on date := timezone('Asia/Seoul', now())::date;
  v_effective_join_on date;
  v_eligible integer;
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

  if v_invite.id is null or v_invite.expires_at <= now() then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  end if;

  select c.* into strict v_challenge
  from public.challenges c
  where c.id = v_invite.challenge_id
  for update;

  if now() >= v_challenge.ends_at then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, false);
    return jsonb_build_object('ok', false, 'error_code', 'CHALLENGE_CLOSED');
  end if;

  select m.* into v_existing
  from public.challenge_members m
  where m.challenge_id = v_challenge.id
    and m.user_id = v_user_id;

  if v_existing.id is not null then
    if v_existing.status = 'active' then
      return jsonb_build_object('ok', true, 'member', to_jsonb(v_existing), 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'ALREADY_PARTICIPATED');
  end if;

  select count(*)::integer into v_member_count
  from public.challenge_members m
  where m.challenge_id = v_challenge.id
    and m.status = 'active';
  if v_member_count >= v_challenge.capacity then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, true);
    return jsonb_build_object('ok', false, 'error_code', 'CAPACITY_FULL');
  end if;

  v_effective_join_on := greatest(v_joined_on, v_challenge.start_on);
  select count(*)::integer into v_eligible
  from public.challenge_days d
  where d.challenge_id = v_challenge.id
    and not d.is_holiday
    and d.challenge_on >= v_effective_join_on;

  if v_eligible <= 0 then
    insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
    values (v_user_id, v_code, true);
    return jsonb_build_object('ok', false, 'error_code', 'NO_ELIGIBLE_DAYS');
  end if;

  insert into public.profiles (id, nickname)
  values (v_user_id, '사용자')
  on conflict (id) do nothing;

  insert into public.challenge_members (
    challenge_id, user_id, role, status, joined_at, joined_on,
    eligible_day_count, applied_limit, is_late_join
  ) values (
    v_challenge.id, v_user_id, 'member', 'active', now(), v_joined_on,
    v_eligible,
    (v_challenge.base_amount * v_eligible) / v_challenge.selected_day_count,
    now() >= v_challenge.starts_at
  )
  returning * into v_member;

  insert into private.invite_code_attempts (user_id, normalized_code, was_successful)
  values (v_user_id, v_code, true);

  perform private.enqueue_notification(
    recipient.user_id,
    'member_joined',
    v_user_id,
    v_challenge.id,
    null,
    null,
    '/challenges/' || v_challenge.id::text || '/members',
    'member_joined:' || v_challenge.id::text || ':' || v_member.id::text
  )
  from public.challenge_members recipient
  where recipient.challenge_id = v_challenge.id
    and recipient.status = 'active'
    and recipient.user_id <> v_user_id;

  if v_member_count + 1 = v_challenge.capacity then
    perform private.enqueue_notification(
      v_challenge.owner_id,
      'capacity_full',
      v_user_id,
      v_challenge.id,
      null,
      null,
      '/challenges/' || v_challenge.id::text || '/members',
      'capacity_full:' || v_challenge.id::text
    );
  end if;

  perform private.write_audit_event(
    v_user_id,
    'challenge.joined',
    'challenge',
    v_challenge.id,
    jsonb_build_object(
      'member_id', v_member.id,
      'joined_on', v_joined_on,
      'eligible_day_count', v_eligible,
      'applied_limit', v_member.applied_limit
    )
  );

  return jsonb_build_object('ok', true, 'member', to_jsonb(v_member), 'idempotent', false);
end;
$$;

create function public.join_challenge(p_invite_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.join_challenge_impl(p_invite_code);
$$;

create function private.add_expense_impl(
  p_challenge_id uuid,
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
  v_challenge public.challenges%rowtype;
  v_member public.challenge_members%rowtype;
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

  if p_challenge_id is null then
    if p_photo_path is not null then
      v_photo_uploaded_at := private.assert_owned_photo(v_user_id, null, p_photo_path);
    end if;
  else
    select c.* into v_challenge
    from public.challenges c
    where c.id = p_challenge_id
    for share;

    if v_challenge.id is null then
      raise exception using errcode = '22023', message = 'challenge not found';
    end if;
    if v_now < v_challenge.starts_at or v_now >= v_challenge.correction_ends_at then
      raise exception using errcode = '22023', message = 'challenge expenses are writable only during active and adjustment states';
    end if;

    select m.* into v_member
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = v_user_id
      and m.status = 'active';
    if v_member.id is null then
      raise exception using errcode = '42501', message = 'an active challenge membership is required';
    end if;

    if p_occurred_at < v_challenge.starts_at
       or p_occurred_at >= v_challenge.ends_at
       or p_occurred_at < v_member.joined_at then
      raise exception using errcode = '22023', message = 'expense time is outside the member eligible period';
    end if;

    v_occurred_on := timezone(v_challenge.timezone, p_occurred_at)::date;
    if not exists (
      select 1
      from public.challenge_days d
      where d.challenge_id = p_challenge_id
        and d.challenge_on = v_occurred_on
        and not d.is_holiday
    ) then
      raise exception using errcode = '22023', message = 'challenge expenses cannot be linked to an excluded holiday';
    end if;

    if p_photo_path is null then
      raise exception using errcode = '22023', message = 'exactly one uploaded photo is required for a challenge expense';
    end if;
    v_photo_uploaded_at := private.assert_owned_photo(v_user_id, p_challenge_id, p_photo_path);
    if v_photo_uploaded_at >= v_challenge.correction_ends_at then
      raise exception using errcode = '22023', message = 'photo upload completed after the adjustment deadline';
    end if;
  end if;

  insert into public.expenses (
    user_id, challenge_id, amount, category, occurred_at, memo,
    photo_path, photo_uploaded_at, client_request_id
  ) values (
    v_user_id, p_challenge_id, p_amount, p_category, p_occurred_at,
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
    jsonb_build_object('challenge_id', p_challenge_id, 'amount', p_amount)
  );
  return v_expense;
end;
$$;

create function public.add_expense(
  p_challenge_id uuid,
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
    p_challenge_id,
    p_amount,
    p_category,
    p_occurred_at,
    p_memo,
    p_photo_path,
    p_client_request_id
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
  v_challenge public.challenges%rowtype;
  v_member public.challenge_members%rowtype;
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

  if v_expense.challenge_id is null then
    if p_photo_path is not null then
      v_photo_uploaded_at := private.assert_owned_photo(v_user_id, null, p_photo_path);
    end if;
  else
    select c.* into strict v_challenge
    from public.challenges c
    where c.id = v_expense.challenge_id
    for share;
    if v_now >= v_challenge.correction_ends_at then
      raise exception using errcode = '22023', message = 'expense adjustment deadline has passed';
    end if;

    select m.* into v_member
    from public.challenge_members m
    where m.challenge_id = v_expense.challenge_id
      and m.user_id = v_user_id
      and m.status = 'active';
    if v_member.id is null then
      raise exception using errcode = '42501', message = 'an active challenge membership is required';
    end if;
    if p_occurred_at < v_challenge.starts_at
       or p_occurred_at >= v_challenge.ends_at
       or p_occurred_at < v_member.joined_at then
      raise exception using errcode = '22023', message = 'expense time is outside the member eligible period';
    end if;

    v_occurred_on := timezone(v_challenge.timezone, p_occurred_at)::date;
    if not exists (
      select 1 from public.challenge_days d
      where d.challenge_id = v_expense.challenge_id
        and d.challenge_on = v_occurred_on
        and not d.is_holiday
    ) then
      raise exception using errcode = '22023', message = 'challenge expenses cannot be linked to an excluded holiday';
    end if;
    if p_photo_path is null then
      raise exception using errcode = '22023', message = 'exactly one uploaded photo is required for a challenge expense';
    end if;
    v_photo_uploaded_at := private.assert_owned_photo(v_user_id, v_expense.challenge_id, p_photo_path);
    if v_photo_uploaded_at >= v_challenge.correction_ends_at then
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
    p_expense_id,
    p_amount,
    p_category,
    p_occurred_at,
    p_memo,
    p_photo_path,
    p_expected_version
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

  if v_expense.challenge_id is not null then
    select c.correction_ends_at into strict v_deadline
    from public.challenges c
    where c.id = v_expense.challenge_id;
    if statement_timestamp() >= v_deadline then
      raise exception using errcode = '22023', message = 'expense adjustment deadline has passed';
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
  v_challenge public.challenges%rowtype;
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
     or v_expense.challenge_id is null
     or v_expense.deleted_at is not null then
    raise exception using errcode = '22023', message = 'comments require a visible challenge expense';
  end if;

  select c.* into strict v_challenge
  from public.challenges c
  where c.id = v_expense.challenge_id;
  if statement_timestamp() < v_challenge.starts_at
     or statement_timestamp() >= v_challenge.finalizes_at then
    raise exception using errcode = '22023', message = 'comments are writable only from challenge start through settlement';
  end if;
  if not private.is_active_challenge_member(v_challenge.id, v_user_id) then
    raise exception using errcode = '42501', message = 'an active challenge membership is required';
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
      v_challenge.id,
      v_expense.id,
      v_comment.id,
      '/challenges/' || v_challenge.id::text || '/expenses/' || v_expense.id::text,
      'expense_comment:' || v_comment.id::text
    );
  end if;

  if p_reply_to_comment_id is not null then
    perform private.enqueue_notification(
      v_parent.user_id,
      'comment_reply',
      v_user_id,
      v_challenge.id,
      v_expense.id,
      v_comment.id,
      '/challenges/' || v_challenge.id::text || '/expenses/' || v_expense.id::text,
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
    p_expense_id,
    p_body,
    p_reply_to_comment_id,
    p_client_request_id
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
  v_challenge public.challenges%rowtype;
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

  select ch.* into strict v_challenge
  from public.challenges ch
  join public.expenses e on e.challenge_id = ch.id
  where e.id = v_comment.expense_id;
  if statement_timestamp() >= v_challenge.finalizes_at
     or not private.is_active_challenge_member(v_challenge.id, v_user_id) then
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
  v_challenge_id uuid;
  v_finalizes_at timestamptz;
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

  select ch.id, ch.finalizes_at
  into strict v_challenge_id, v_finalizes_at
  from public.challenges ch
  join public.expenses e on e.challenge_id = ch.id
  where e.id = v_comment.expense_id;
  if statement_timestamp() >= v_finalizes_at
     or not private.is_active_challenge_member(v_challenge_id, v_user_id) then
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

create function private.update_challenge_settings_impl(
  p_challenge_id uuid,
  p_name text,
  p_capacity smallint
)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_active_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select c.* into v_challenge
  from public.challenges c
  where c.id = p_challenge_id
  for update;
  if v_challenge.id is null or v_challenge.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the current room owner can update settings';
  end if;
  if statement_timestamp() >= v_challenge.ends_at then
    raise exception using errcode = '22023', message = 'challenge settings are locked after the challenge end boundary';
  end if;

  if p_name is not null and char_length(btrim(p_name)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'challenge name must be 1 to 40 characters';
  end if;

  if p_capacity is not null then
    select count(*)::integer into v_active_count
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.status = 'active';
    if p_capacity < v_challenge.capacity
       or p_capacity < v_active_count
       or p_capacity > 10 then
      raise exception using errcode = '22023', message = 'capacity can only increase up to 10';
    end if;
  end if;

  update public.challenges
  set name = coalesce(btrim(p_name), name),
      capacity = coalesce(p_capacity, capacity)
  where id = p_challenge_id
  returning * into v_challenge;

  perform private.write_audit_event(
    v_user_id,
    'challenge.settings_updated',
    'challenge',
    p_challenge_id,
    jsonb_build_object('name', v_challenge.name, 'capacity', v_challenge.capacity)
  );
  return v_challenge;
end;
$$;

create function public.update_challenge_settings(
  p_challenge_id uuid,
  p_name text,
  p_capacity smallint
)
returns public.challenges
language sql
security invoker
set search_path = ''
as $$
  select private.update_challenge_settings_impl(p_challenge_id, p_name, p_capacity);
$$;

create function private.rotate_invite_code_impl(p_challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_code text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select c.* into v_challenge
  from public.challenges c
  where c.id = p_challenge_id
  for update;
  if v_challenge.id is null or v_challenge.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the current room owner can rotate invite codes';
  end if;
  if statement_timestamp() >= v_challenge.ends_at then
    raise exception using errcode = '22023', message = 'invite code expired at the challenge end boundary';
  end if;

  update public.invite_codes
  set is_active = false,
      revoked_at = statement_timestamp()
  where challenge_id = p_challenge_id
    and is_active;

  v_code := private.generate_invite_code();
  insert into public.invite_codes (challenge_id, code, created_by, expires_at)
  values (p_challenge_id, v_code, v_user_id, v_challenge.ends_at);

  perform private.write_audit_event(
    v_user_id,
    'challenge.invite_rotated',
    'challenge',
    p_challenge_id,
    '{}'::jsonb
  );
  return v_code;
end;
$$;

create function public.rotate_invite_code(p_challenge_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.rotate_invite_code_impl(p_challenge_id);
$$;

create function private.leave_challenge_impl(
  p_challenge_id uuid,
  p_successor_user_id uuid
)
returns public.challenge_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_member public.challenge_members%rowtype;
  v_successor public.challenge_members%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select c.* into v_challenge
  from public.challenges c
  where c.id = p_challenge_id
  for update;
  if v_challenge.id is null then
    raise exception using errcode = '22023', message = 'challenge not found';
  end if;
  if statement_timestamp() >= v_challenge.ends_at then
    raise exception using errcode = '22023', message = 'members cannot leave after the challenge end boundary';
  end if;

  select m.* into v_member
  from public.challenge_members m
  where m.challenge_id = p_challenge_id
    and m.user_id = v_user_id
  for update;
  if v_member.id is null or v_member.status <> 'active' then
    raise exception using errcode = '42501', message = 'active membership not found';
  end if;

  if v_member.role = 'owner' then
    if p_successor_user_id is null or p_successor_user_id = v_user_id then
      raise exception using errcode = '22023', message = 'room owner must select another active member as successor';
    end if;
    select m.* into v_successor
    from public.challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_successor_user_id
      and m.status = 'active'
    for update;
    if v_successor.id is null then
      raise exception using errcode = '22023', message = 'successor must be an active challenge member';
    end if;

    update public.challenge_members
    set role = 'member', status = 'left', left_at = statement_timestamp()
    where id = v_member.id
    returning * into v_member;

    update public.challenge_members
    set role = 'owner'
    where id = v_successor.id;

    update public.challenges
    set owner_id = p_successor_user_id
    where id = p_challenge_id;
  else
    update public.challenge_members
    set status = 'left', left_at = statement_timestamp()
    where id = v_member.id
    returning * into v_member;
  end if;

  perform private.write_audit_event(
    v_user_id,
    'challenge.left',
    'challenge',
    p_challenge_id,
    jsonb_build_object('successor_user_id', p_successor_user_id)
  );
  return v_member;
end;
$$;

create function public.leave_challenge(
  p_challenge_id uuid,
  p_successor_user_id uuid
)
returns public.challenge_members
language sql
security invoker
set search_path = ''
as $$
  select private.leave_challenge_impl(p_challenge_id, p_successor_user_id);
$$;

create function private.delete_challenge_impl(p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_challenge public.challenges%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select c.* into v_challenge
  from public.challenges c
  where c.id = p_challenge_id
  for update;
  if v_challenge.id is null or v_challenge.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the current room owner can delete a challenge';
  end if;
  if statement_timestamp() >= v_challenge.starts_at then
    raise exception using errcode = '22023', message = 'challenge can only be deleted before it starts';
  end if;
  if exists (select 1 from public.expenses e where e.challenge_id = p_challenge_id) then
    raise exception using errcode = '22023', message = 'challenge with shared expenses cannot be deleted';
  end if;

  perform private.write_audit_event(
    v_user_id,
    'challenge.deleted',
    'challenge',
    p_challenge_id,
    jsonb_build_object('name', v_challenge.name)
  );
  delete from public.challenges where id = p_challenge_id;
  return true;
end;
$$;

create function public.delete_challenge(p_challenge_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_challenge_impl(p_challenge_id);
$$;

create function private.finalize_challenge_core(p_challenge_id uuid)
returns public.challenge_archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_archive public.challenge_archives%rowtype;
  v_conditions jsonb;
  v_overall_success boolean;
  v_crown_user_ids uuid[];
begin
  select c.* into v_challenge
  from public.challenges c
  where c.id = p_challenge_id
  for update;
  if v_challenge.id is null then
    raise exception using errcode = '22023', message = 'challenge not found';
  end if;

  select a.* into v_archive
  from public.challenge_archives a
  where a.challenge_id = p_challenge_id;
  if found then
    return v_archive;
  end if;

  if statement_timestamp() < v_challenge.finalizes_at then
    raise exception using errcode = '22023', message = 'challenge cannot be finalized before F';
  end if;

  select jsonb_build_object(
    'challenge_id', v_challenge.id,
    'name', v_challenge.name,
    'start_on', v_challenge.start_on,
    'end_on', v_challenge.end_on,
    'starts_at', v_challenge.starts_at,
    'ends_at', v_challenge.ends_at,
    'correction_ends_at', v_challenge.correction_ends_at,
    'finalizes_at', v_challenge.finalizes_at,
    'base_amount', v_challenge.base_amount,
    'currency', v_challenge.currency,
    'timezone', v_challenge.timezone,
    'selected_day_count', v_challenge.selected_day_count,
    'valid_day_count', v_challenge.valid_day_count,
    'holiday_version_id', v_challenge.holiday_version_id,
    'days', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', d.challenge_on,
            'is_holiday', d.is_holiday,
            'holiday_name', d.holiday_name
          ) order by d.challenge_on
        )
        from public.challenge_days d
        where d.challenge_id = p_challenge_id
      ),
      '[]'::jsonb
    )
  ) into v_conditions;

  insert into public.challenge_archives (
    challenge_id, conditions_snapshot, overall_success, crown_user_ids,
    locked_at, finalized_at
  ) values (
    p_challenge_id, v_conditions, false, '{}',
    v_challenge.correction_ends_at, v_challenge.finalizes_at
  )
  returning * into v_archive;

  with member_spend as (
    select
      m.id as member_id,
      m.challenge_id,
      m.user_id,
      m.status,
      m.joined_at,
      m.joined_on,
      m.eligible_day_count,
      m.applied_limit,
      p.nickname,
      coalesce(sum(e.amount) filter (
        where e.deleted_at is null and e.excluded_at is null
      ), 0)::bigint as spent_amount
    from public.challenge_members m
    join public.profiles p on p.id = m.user_id
    left join public.expenses e
      on e.challenge_id = m.challenge_id
     and e.user_id = m.user_id
    where m.challenge_id = p_challenge_id
    group by m.id, p.nickname
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
  insert into public.challenge_member_results (
    challenge_id, member_id, user_id, nickname_snapshot, status_snapshot,
    joined_at, joined_on, eligible_day_count, applied_limit,
    spent_amount, remaining_amount, achieved, is_crown
  )
  select
    p_challenge_id,
    r.member_id,
    r.user_id,
    r.nickname,
    r.status,
    r.joined_at,
    r.joined_on,
    r.eligible_day_count,
    r.applied_limit,
    r.spent_amount,
    r.remaining_amount,
    r.spent_amount <= r.applied_limit,
    r.status = 'active' and r.remaining_amount = r.max_active_remaining
  from ranked r;

  select
    coalesce(bool_and(r.achieved) filter (where r.status_snapshot = 'active'), false),
    coalesce(array_agg(r.user_id order by r.user_id) filter (where r.is_crown), '{}'::uuid[])
  into v_overall_success, v_crown_user_ids
  from public.challenge_member_results r
  where r.challenge_id = p_challenge_id;

  update public.challenge_archives
  set overall_success = v_overall_success,
      crown_user_ids = v_crown_user_ids
  where challenge_id = p_challenge_id
  returning * into v_archive;

  update public.challenges
  set finalized_at = finalizes_at
  where id = p_challenge_id;

  perform private.write_audit_event(
    auth.uid(),
    'challenge.finalized',
    'challenge',
    p_challenge_id,
    jsonb_build_object(
      'overall_success', v_overall_success,
      'crown_user_ids', to_jsonb(v_crown_user_ids)
    )
  );
  return v_archive;
end;
$$;

create function private.finalize_challenge_for_member_impl(p_challenge_id uuid)
returns public.challenge_archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not private.is_challenge_member(p_challenge_id, v_user_id) then
    raise exception using errcode = '42501', message = 'challenge membership required';
  end if;
  return private.finalize_challenge_core(p_challenge_id);
end;
$$;

create function public.finalize_challenge(p_challenge_id uuid)
returns public.challenge_archives
language sql
security invoker
set search_path = ''
as $$
  select private.finalize_challenge_for_member_impl(p_challenge_id);
$$;

create function private.finalize_due_challenges(p_limit integer default 100)
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
    select c.id
    from public.challenges c
    where c.finalizes_at <= statement_timestamp()
      and c.finalized_at is null
      and not exists (
        select 1 from public.challenge_archives a where a.challenge_id = c.id
      )
    order by c.finalizes_at, c.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform private.finalize_challenge_core(v_row.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Time state is derived from server boundaries; no mutable client state can
-- drift from S/E/C/F.
create view public.challenge_status_view
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.creator_id,
  c.owner_id,
  c.start_on,
  c.end_on,
  c.starts_at,
  c.ends_at,
  c.correction_ends_at,
  c.finalizes_at,
  c.base_amount,
  c.currency,
  c.timezone,
  c.capacity,
  c.selected_day_count,
  c.valid_day_count,
  c.holiday_version_id,
  c.finalized_at,
  c.created_at,
  c.updated_at,
  case
    when statement_timestamp() < c.starts_at then 'waiting'::public.challenge_state
    when statement_timestamp() < c.ends_at then 'active'::public.challenge_state
    when statement_timestamp() < c.correction_ends_at then 'adjustment'::public.challenge_state
    when statement_timestamp() < c.finalizes_at then 'settling'::public.challenge_state
    else 'archived'::public.challenge_state
  end as state
from public.challenges c;

create view public.challenge_member_progress
with (security_invoker = true)
as
with member_spend as (
  select
    m.id as member_id,
    m.challenge_id,
    m.user_id,
    p.nickname,
    p.avatar_path,
    m.role,
    m.status,
    m.joined_at,
    m.joined_on,
    m.eligible_day_count,
    m.applied_limit,
    m.is_late_join,
    coalesce(sum(e.amount) filter (
      where e.deleted_at is null and e.excluded_at is null
    ), 0)::bigint as spent_amount
  from public.challenge_members m
  join public.profiles p on p.id = m.user_id
  left join public.expenses e
    on e.challenge_id = m.challenge_id
   and e.user_id = m.user_id
  group by m.id, p.id
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
    ) over (partition by p.challenge_id) as is_crown
from progress p;

do $cron_setup$
begin
  if not exists (
    select 1 from cron.job where jobname = 'jaringoby-finalize-due-challenges'
  ) then
    perform cron.schedule(
      'jaringoby-finalize-due-challenges',
      '* * * * *',
      'select private.finalize_due_challenges(100);'
    );
  end if;
end
$cron_setup$;

-- Row-level security: every table in the exposed public schema is protected.
alter table public.profiles enable row level security;
alter table public.holiday_calendar_versions enable row level security;
alter table public.korean_holidays enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_days enable row level security;
alter table public.challenge_members enable row level security;
alter table public.invite_codes enable row level security;
alter table public.expenses enable row level security;
alter table public.comments enable row level security;
alter table public.challenge_archives enable row level security;
alter table public.challenge_member_results enable row level security;
alter table public.user_challenge_preferences enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.device_push_tokens enable row level security;

-- Defense in depth for private operational data as well.
alter table private.invite_code_attempts enable row level security;
alter table private.audit_events enable row level security;

create policy profiles_select_shared_challenge
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.shares_challenge((select auth.uid()), id)
);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy holiday_versions_read_authenticated
on public.holiday_calendar_versions
for select
to authenticated
using (true);

create policy korean_holidays_read_authenticated
on public.korean_holidays
for select
to authenticated
using (true);

create policy challenges_read_members
on public.challenges
for select
to authenticated
using (private.is_challenge_member(id, (select auth.uid())));

create policy challenge_days_read_members
on public.challenge_days
for select
to authenticated
using (private.is_challenge_member(challenge_id, (select auth.uid())));

create policy challenge_members_read_room_members
on public.challenge_members
for select
to authenticated
using (private.is_challenge_member(challenge_id, (select auth.uid())));

create policy invite_codes_read_active_members
on public.invite_codes
for select
to authenticated
using (private.is_active_challenge_member(challenge_id, (select auth.uid())));

create policy expenses_read_owner_or_room_members
on public.expenses
for select
to authenticated
using (
  (challenge_id is null and user_id = (select auth.uid()))
  or (
    challenge_id is not null
    and private.is_challenge_member(challenge_id, (select auth.uid()))
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
      and e.challenge_id is not null
      and private.is_challenge_member(e.challenge_id, (select auth.uid()))
  )
);

create policy challenge_archives_read_members
on public.challenge_archives
for select
to authenticated
using (private.is_challenge_member(challenge_id, (select auth.uid())));

create policy challenge_member_results_read_members
on public.challenge_member_results
for select
to authenticated
using (private.is_challenge_member(challenge_id, (select auth.uid())));

create policy challenge_preferences_read_self
on public.user_challenge_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

create policy challenge_preferences_insert_self_member
on public.user_challenge_preferences
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_challenge_member(challenge_id, (select auth.uid()))
);

create policy challenge_preferences_update_self_member
on public.user_challenge_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and private.is_challenge_member(challenge_id, (select auth.uid()))
);

create policy challenge_preferences_delete_self
on public.user_challenge_preferences
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy reports_read_own
on public.reports
for select
to authenticated
using (reporter_id = (select auth.uid()));

create policy reports_insert_accessible_target
on public.reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and case target_type
    when 'profile' then exists (
      select 1 from public.profiles p where p.id = target_id
    )
    when 'expense' then exists (
      select 1 from public.expenses e where e.id = target_id
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = target_id
    )
  end
);

create policy blocks_read_own
on public.blocks
for select
to authenticated
using (blocker_id = (select auth.uid()));

create policy blocks_insert_own_visible_profile
on public.blocks
for insert
to authenticated
with check (
  blocker_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = blocked_id)
);

create policy blocks_delete_own
on public.blocks
for delete
to authenticated
using (blocker_id = (select auth.uid()));

create policy notifications_read_own
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

create policy notifications_update_read_state_own
on public.notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy device_push_tokens_read_own
on public.device_push_tokens
for select
to authenticated
using (user_id = (select auth.uid()));

create policy device_push_tokens_insert_own
on public.device_push_tokens
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy device_push_tokens_update_own
on public.device_push_tokens
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy device_push_tokens_delete_own
on public.device_push_tokens
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Private object storage. Paths are deterministic:
-- expense-photos/{challenge-id|personal}/{user-id}/{object}
-- profile-images/{user-id}/{object}
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values
  (
    'expense-photos',
    'expense-photos',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'profile-images',
    'profile-images',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
            e.challenge_id is not null
            and private.is_challenge_member(e.challenge_id, (select auth.uid()))
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
      from public.challenges c
      where c.id::text = split_part(storage.objects.name, '/', 1)
        and statement_timestamp() >= c.starts_at
        and statement_timestamp() < c.correction_ends_at
        and private.is_active_challenge_member(c.id, (select auth.uid()))
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
      from public.challenges c
      where c.id::text = split_part(storage.objects.name, '/', 1)
        and statement_timestamp() >= c.starts_at
        and statement_timestamp() < c.correction_ends_at
        and private.is_active_challenge_member(c.id, (select auth.uid()))
    )
  )
);

create policy expense_photos_delete_owner
on storage.objects
for delete
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
        and private.shares_challenge((select auth.uid()), p.id)
    )
  )
);

create policy profile_images_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and name !~ '(^/|\.\.)'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and split_part(name, '/', 2) <> ''
);

create policy profile_images_update_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-images'
  and owner_id = (select auth.uid())::text
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy profile_images_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and owner_id = (select auth.uid())::text
);

-- Explicit 2026 Data API grants. No anonymous or service-role Data API surface
-- is needed by the mobile app.
revoke all on table
  public.profiles,
  public.holiday_calendar_versions,
  public.korean_holidays,
  public.challenges,
  public.challenge_days,
  public.challenge_members,
  public.invite_codes,
  public.expenses,
  public.comments,
  public.challenge_archives,
  public.challenge_member_results,
  public.user_challenge_preferences,
  public.reports,
  public.blocks,
  public.notifications,
  public.device_push_tokens
from public, anon, service_role;

grant select on table
  public.profiles,
  public.holiday_calendar_versions,
  public.korean_holidays,
  public.challenges,
  public.challenge_days,
  public.challenge_members,
  public.invite_codes,
  public.expenses,
  public.comments,
  public.challenge_archives,
  public.challenge_member_results,
  public.user_challenge_preferences,
  public.reports,
  public.blocks,
  public.notifications,
  public.device_push_tokens
to authenticated;

grant insert (id, nickname, avatar_path, notifications_enabled)
  on public.profiles to authenticated;
grant update (nickname, avatar_path, notifications_enabled)
  on public.profiles to authenticated;
grant insert (user_id, challenge_id, is_hidden, notifications_enabled)
  on public.user_challenge_preferences to authenticated;
grant update (is_hidden, notifications_enabled)
  on public.user_challenge_preferences to authenticated;
grant delete on public.user_challenge_preferences to authenticated;
grant insert (reporter_id, target_type, target_id, reason, details)
  on public.reports to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
grant delete on public.blocks to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (user_id, platform, token, device_id, is_enabled, last_seen_at)
  on public.device_push_tokens to authenticated;
grant update (platform, token, device_id, is_enabled, last_seen_at)
  on public.device_push_tokens to authenticated;
grant delete on public.device_push_tokens to authenticated;

revoke all on table public.challenge_status_view, public.challenge_member_progress
from public, anon, service_role;
grant select on table public.challenge_status_view, public.challenge_member_progress
to authenticated;

-- Lock private helpers first, then allow only the functions reached through a
-- public authenticated RPC or required by an RLS policy.
revoke execute on all functions in schema private
from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

grant execute on function private.is_challenge_member(uuid, uuid) to authenticated;
grant execute on function private.is_active_challenge_member(uuid, uuid) to authenticated;
grant execute on function private.shares_challenge(uuid, uuid) to authenticated;
grant execute on function private.create_challenge_impl(text, date, date, bigint, smallint, text, uuid) to authenticated;
grant execute on function private.preview_invite_impl(text) to authenticated;
grant execute on function private.join_challenge_impl(text) to authenticated;
grant execute on function private.add_expense_impl(uuid, bigint, public.expense_category, timestamptz, text, text, uuid) to authenticated;
grant execute on function private.update_expense_impl(uuid, bigint, public.expense_category, timestamptz, text, text, integer) to authenticated;
grant execute on function private.delete_expense_impl(uuid, integer) to authenticated;
grant execute on function private.add_comment_impl(uuid, text, uuid, uuid) to authenticated;
grant execute on function private.update_comment_impl(uuid, text, integer) to authenticated;
grant execute on function private.delete_comment_impl(uuid, integer) to authenticated;
grant execute on function private.update_challenge_settings_impl(uuid, text, smallint) to authenticated;
grant execute on function private.rotate_invite_code_impl(uuid) to authenticated;
grant execute on function private.leave_challenge_impl(uuid, uuid) to authenticated;
grant execute on function private.delete_challenge_impl(uuid) to authenticated;
grant execute on function private.finalize_challenge_for_member_impl(uuid) to authenticated;

revoke execute on function public.create_challenge(text, date, date, bigint, smallint, text, uuid) from public, anon, service_role;
revoke execute on function public.preview_invite(text) from public, anon, service_role;
revoke execute on function public.join_challenge(text) from public, anon, service_role;
revoke execute on function public.add_expense(uuid, bigint, public.expense_category, timestamptz, text, text, uuid) from public, anon, service_role;
revoke execute on function public.update_expense(uuid, bigint, public.expense_category, timestamptz, text, text, integer) from public, anon, service_role;
revoke execute on function public.delete_expense(uuid, integer) from public, anon, service_role;
revoke execute on function public.add_comment(uuid, text, uuid, uuid) from public, anon, service_role;
revoke execute on function public.update_comment(uuid, text, integer) from public, anon, service_role;
revoke execute on function public.delete_comment(uuid, integer) from public, anon, service_role;
revoke execute on function public.update_challenge_settings(uuid, text, smallint) from public, anon, service_role;
revoke execute on function public.rotate_invite_code(uuid) from public, anon, service_role;
revoke execute on function public.leave_challenge(uuid, uuid) from public, anon, service_role;
revoke execute on function public.delete_challenge(uuid) from public, anon, service_role;
revoke execute on function public.finalize_challenge(uuid) from public, anon, service_role;

grant execute on function public.create_challenge(text, date, date, bigint, smallint, text, uuid) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.join_challenge(text) to authenticated;
grant execute on function public.add_expense(uuid, bigint, public.expense_category, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.update_expense(uuid, bigint, public.expense_category, timestamptz, text, text, integer) to authenticated;
grant execute on function public.delete_expense(uuid, integer) to authenticated;
grant execute on function public.add_comment(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.update_comment(uuid, text, integer) to authenticated;
grant execute on function public.delete_comment(uuid, integer) to authenticated;
grant execute on function public.update_challenge_settings(uuid, text, smallint) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;
grant execute on function public.leave_challenge(uuid, uuid) to authenticated;
grant execute on function public.delete_challenge(uuid) to authenticated;
grant execute on function public.finalize_challenge(uuid) to authenticated;

-- Realtime is limited to room state, feed, chat, and final result changes.
do $realtime_setup$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'challenges',
      'challenge_members',
      'expenses',
      'comments',
      'notifications',
      'challenge_archives',
      'challenge_member_results'
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
