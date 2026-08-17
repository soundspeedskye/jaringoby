-- 냥냥톡톡: 방에 직접 매달리는 가벼운 이야기와 평면 댓글.
-- 지출 댓글 경로와 분리해 주차 정산 규칙을 흔들지 않는다.

create type public.room_post_kind as enum ('notice', 'post');

create table public.room_posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  period_id uuid references public.periods(id) on delete set null,
  kind public.room_post_kind not null default 'post',
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz,
  version integer not null default 1,
  client_request_id uuid not null,
  constraint room_posts_body_length check (char_length(btrim(body)) between 1 and 500),
  constraint room_posts_version_positive check (version >= 1),
  unique (author_id, client_request_id)
);

create table public.room_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.room_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz,
  version integer not null default 1,
  client_request_id uuid not null,
  constraint room_post_comments_body_length check (char_length(btrim(body)) between 1 and 300),
  constraint room_post_comments_version_positive check (version >= 1),
  unique (author_id, client_request_id)
);

create table public.room_post_reactions (
  post_id uuid not null references public.room_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (post_id, user_id, emoji),
  constraint room_post_reactions_emoji check (emoji in ('❤️', '👍', '👏'))
);

create index room_posts_room_created_idx on public.room_posts(room_id, created_at desc);
create index room_posts_period_created_idx on public.room_posts(period_id, created_at desc)
  where period_id is not null;
create index room_post_comments_post_created_idx on public.room_post_comments(post_id, created_at);

alter table public.room_posts enable row level security;
alter table public.room_post_comments enable row level security;
alter table public.room_post_reactions enable row level security;

create policy room_posts_read_room_members on public.room_posts
for select to authenticated
using (private.is_room_member(room_id, auth.uid()));

create policy room_post_comments_read_room_members on public.room_post_comments
for select to authenticated
using (
  exists (
    select 1 from public.room_posts p
    where p.id = room_post_comments.post_id
      and private.is_room_member(p.room_id, auth.uid())
  )
);

create policy room_post_reactions_read_room_members on public.room_post_reactions
for select to authenticated
using (
  exists (
    select 1 from public.room_posts p
    where p.id = room_post_reactions.post_id
      and private.is_room_member(p.room_id, auth.uid())
  )
);

-- 소식함은 공지에만 사용한다. 기존 행은 NULL이므로 안전하다.
alter type public.notification_kind add value if not exists 'room_notice';
alter table public.notifications add column if not exists post_id uuid
  references public.room_posts(id) on delete set null;

create or replace function private.touch_room_post_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger room_posts_touch_updated_at
before update on public.room_posts
for each row execute function private.touch_room_post_updated_at();

create trigger room_post_comments_touch_updated_at
before update on public.room_post_comments
for each row execute function private.touch_room_post_updated_at();

create or replace function private.current_room_period_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.periods p
  where p.room_id = p_room_id
    and statement_timestamp() >= p.starts_at
    and statement_timestamp() < p.finalizes_at
  order by p.week_start desc
  limit 1;
$$;

create or replace function private.add_room_post_impl(
  p_room_id uuid,
  p_kind public.room_post_kind,
  p_body text,
  p_client_request_id uuid
)
returns public.room_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_post public.room_posts%rowtype;
  v_recipient record;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_client_request_id is null then raise exception using errcode = '22023', message = 'client_request_id is required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'post body must be 1 to 500 characters';
  end if;

  select * into v_post from public.room_posts
  where author_id = v_user_id and client_request_id = p_client_request_id;
  if found then return v_post; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null or v_room.status <> 'open' then
    raise exception using errcode = '22023', message = 'room is closed or unavailable';
  end if;
  if not private.is_active_room_member(p_room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'active room membership required';
  end if;
  if p_kind = 'notice' and v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the room owner can post a notice';
  end if;

  insert into public.room_posts(room_id, period_id, kind, author_id, body, client_request_id)
  values (p_room_id, private.current_room_period_id(p_room_id), p_kind, v_user_id, btrim(p_body), p_client_request_id)
  returning * into v_post;

  if p_kind = 'notice' then
    for v_recipient in
      select user_id from public.room_members
      where room_id = p_room_id and status = 'active' and user_id <> v_user_id
    loop
      perform private.enqueue_notification(
        v_recipient.user_id, 'room_notice', v_user_id, p_room_id, v_post.period_id,
        null, null, '/room/board', 'room_notice:' || v_post.id::text
      );
      update public.notifications
      set post_id = v_post.id
      where user_id = v_recipient.user_id and dedupe_key = 'room_notice:' || v_post.id::text;
    end loop;
  end if;
  perform private.write_audit_event(v_user_id, 'room_post.created', 'room_post', v_post.id,
    jsonb_build_object('room_id', p_room_id, 'kind', p_kind));
  return v_post;
end;
$$;

create or replace function public.add_room_post(
  p_room_id uuid, p_kind public.room_post_kind, p_body text, p_client_request_id uuid
)
returns public.room_posts language sql security invoker set search_path = ''
as $$ select private.add_room_post_impl(p_room_id, p_kind, p_body, p_client_request_id); $$;

create or replace function private.update_room_post_impl(
  p_post_id uuid, p_body text, p_expected_version integer
)
returns public.room_posts
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_post public.room_posts%rowtype; v_room public.rooms%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then raise exception using errcode = '22023', message = 'post body must be 1 to 500 characters'; end if;
  select * into v_post from public.room_posts where id = p_post_id for update;
  if v_post.id is null or v_post.deleted_at is not null then raise exception using errcode = '22023', message = 'post is unavailable'; end if;
  select * into v_room from public.rooms where id = v_post.room_id for update;
  if v_room.status <> 'open' then raise exception using errcode = '22023', message = 'room is closed'; end if;
  if not private.is_active_room_member(v_post.room_id, v_user_id) then raise exception using errcode = '42501', message = 'active room membership required'; end if;
  if v_post.author_id <> v_user_id and not (v_post.kind = 'notice' and v_room.owner_id = v_user_id) then raise exception using errcode = '42501', message = 'post is not editable'; end if;
  if v_post.version <> p_expected_version then raise exception using errcode = '40001', message = 'post version conflict'; end if;
  update public.room_posts set body = btrim(p_body), version = version + 1 where id = p_post_id returning * into v_post;
  perform private.write_audit_event(v_user_id, 'room_post.updated', 'room_post', v_post.id, jsonb_build_object('version', v_post.version));
  return v_post;
end;
$$;

create or replace function public.update_room_post(p_post_id uuid, p_body text, p_expected_version integer)
returns public.room_posts language sql security invoker set search_path = ''
as $$ select private.update_room_post_impl(p_post_id, p_body, p_expected_version); $$;

create or replace function private.delete_room_post_impl(p_post_id uuid, p_expected_version integer)
returns public.room_posts
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_post public.room_posts%rowtype; v_room public.rooms%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select * into v_post from public.room_posts where id = p_post_id for update;
  if v_post.id is null then raise exception using errcode = '22023', message = 'post not found'; end if;
  if v_post.deleted_at is not null then return v_post; end if;
  select * into v_room from public.rooms where id = v_post.room_id for update;
  if v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then raise exception using errcode = '42501', message = 'post is read-only'; end if;
  if v_post.author_id <> v_user_id and v_room.owner_id <> v_user_id then raise exception using errcode = '42501', message = 'post is not deletable'; end if;
  if v_post.version <> p_expected_version then raise exception using errcode = '40001', message = 'post version conflict'; end if;
  update public.room_posts set body = '', deleted_at = statement_timestamp(), version = version + 1 where id = p_post_id returning * into v_post;
  perform private.write_audit_event(v_user_id, 'room_post.deleted', 'room_post', v_post.id, jsonb_build_object('version', v_post.version));
  return v_post;
end;
$$;

create or replace function public.delete_room_post(p_post_id uuid, p_expected_version integer)
returns public.room_posts language sql security invoker set search_path = ''
as $$ select private.delete_room_post_impl(p_post_id, p_expected_version); $$;

create or replace function private.add_room_post_comment_impl(p_post_id uuid, p_body text, p_client_request_id uuid)
returns public.room_post_comments
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_post public.room_posts%rowtype; v_comment public.room_post_comments%rowtype; v_room public.rooms%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_client_request_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 300 then raise exception using errcode = '22023', message = 'comment body must be 1 to 300 characters'; end if;
  select * into v_comment from public.room_post_comments where author_id = v_user_id and client_request_id = p_client_request_id;
  if found then return v_comment; end if;
  select * into v_post from public.room_posts where id = p_post_id;
  if v_post.id is null or v_post.deleted_at is not null then raise exception using errcode = '22023', message = 'post is unavailable'; end if;
  select * into v_room from public.rooms where id = v_post.room_id;
  if v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then raise exception using errcode = '42501', message = 'active room membership required'; end if;
  insert into public.room_post_comments(post_id, author_id, body, client_request_id) values (p_post_id, v_user_id, btrim(p_body), p_client_request_id) returning * into v_comment;
  perform private.write_audit_event(v_user_id, 'room_post_comment.created', 'room_post_comment', v_comment.id, jsonb_build_object('post_id', p_post_id));
  return v_comment;
end;
$$;

create or replace function public.add_room_post_comment(p_post_id uuid, p_body text, p_client_request_id uuid)
returns public.room_post_comments language sql security invoker set search_path = ''
as $$ select private.add_room_post_comment_impl(p_post_id, p_body, p_client_request_id); $$;

create or replace function private.update_room_post_comment_impl(p_comment_id uuid, p_body text, p_expected_version integer)
returns public.room_post_comments
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_comment public.room_post_comments%rowtype; v_post public.room_posts%rowtype; v_room public.rooms%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 300 then raise exception using errcode = '22023', message = 'comment body must be 1 to 300 characters'; end if;
  select * into v_comment from public.room_post_comments where id = p_comment_id for update;
  if v_comment.id is null or v_comment.deleted_at is not null or v_comment.author_id <> v_user_id then raise exception using errcode = '42501', message = 'comment is not editable'; end if;
  if v_comment.version <> p_expected_version then raise exception using errcode = '40001', message = 'comment version conflict'; end if;
  select * into v_post from public.room_posts where id = v_comment.post_id;
  select * into v_room from public.rooms where id = v_post.room_id;
  if v_post.deleted_at is not null or v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then raise exception using errcode = '42501', message = 'comment is read-only'; end if;
  update public.room_post_comments set body = btrim(p_body), version = version + 1 where id = p_comment_id returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.update_room_post_comment(p_comment_id uuid, p_body text, p_expected_version integer)
returns public.room_post_comments language sql security invoker set search_path = ''
as $$ select private.update_room_post_comment_impl(p_comment_id, p_body, p_expected_version); $$;

create or replace function private.delete_room_post_comment_impl(p_comment_id uuid, p_expected_version integer)
returns public.room_post_comments
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_comment public.room_post_comments%rowtype; v_post public.room_posts%rowtype; v_room public.rooms%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select * into v_comment from public.room_post_comments where id = p_comment_id for update;
  if v_comment.id is null then raise exception using errcode = '22023', message = 'comment not found'; end if;
  if v_comment.deleted_at is not null then return v_comment; end if;
  if v_comment.version <> p_expected_version then raise exception using errcode = '40001', message = 'comment version conflict'; end if;
  select * into v_post from public.room_posts where id = v_comment.post_id;
  select * into v_room from public.rooms where id = v_post.room_id;
  if v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then raise exception using errcode = '42501', message = 'comment is read-only'; end if;
  if v_comment.author_id <> v_user_id and v_room.owner_id <> v_user_id then raise exception using errcode = '42501', message = 'comment is not deletable'; end if;
  update public.room_post_comments set body = '', deleted_at = statement_timestamp(), version = version + 1 where id = p_comment_id returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.delete_room_post_comment(p_comment_id uuid, p_expected_version integer)
returns public.room_post_comments language sql security invoker set search_path = ''
as $$ select private.delete_room_post_comment_impl(p_comment_id, p_expected_version); $$;

create or replace function public.toggle_room_post_reaction(p_post_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_room_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_emoji not in ('❤️', '👍', '👏') then raise exception using errcode = '22023', message = 'unsupported reaction'; end if;
  select room_id into v_room_id from public.room_posts where id = p_post_id and deleted_at is null;
  if v_room_id is null or not private.is_active_room_member(v_room_id, v_user_id) then raise exception using errcode = '42501', message = 'active room membership required'; end if;
  if exists (select 1 from public.room_post_reactions where post_id = p_post_id and user_id = v_user_id and emoji = p_emoji) then
    delete from public.room_post_reactions where post_id = p_post_id and user_id = v_user_id and emoji = p_emoji;
  else
    insert into public.room_post_reactions(post_id, user_id, emoji) values (p_post_id, v_user_id, p_emoji);
  end if;
end;
$$;

revoke all on function public.add_room_post(uuid, public.room_post_kind, text, uuid) from public, anon, service_role;
revoke all on function public.update_room_post(uuid, text, integer) from public, anon, service_role;
revoke all on function public.delete_room_post(uuid, integer) from public, anon, service_role;
revoke all on function public.add_room_post_comment(uuid, text, uuid) from public, anon, service_role;
revoke all on function public.update_room_post_comment(uuid, text, integer) from public, anon, service_role;
revoke all on function public.delete_room_post_comment(uuid, integer) from public, anon, service_role;
revoke all on function public.toggle_room_post_reaction(uuid, text) from public, anon, service_role;
grant execute on function public.add_room_post(uuid, public.room_post_kind, text, uuid) to authenticated;
grant execute on function public.update_room_post(uuid, text, integer) to authenticated;
grant execute on function public.delete_room_post(uuid, integer) to authenticated;
grant execute on function public.add_room_post_comment(uuid, text, uuid) to authenticated;
grant execute on function public.update_room_post_comment(uuid, text, integer) to authenticated;
grant execute on function public.delete_room_post_comment(uuid, integer) to authenticated;
grant execute on function public.toggle_room_post_reaction(uuid, text) to authenticated;
grant select on public.room_posts, public.room_post_comments, public.room_post_reactions to authenticated;

do $realtime_setup$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_posts') then alter publication supabase_realtime add table public.room_posts; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_post_comments') then alter publication supabase_realtime add table public.room_post_comments; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_post_reactions') then alter publication supabase_realtime add table public.room_post_reactions; end if;
  end if;
end
$realtime_setup$;
