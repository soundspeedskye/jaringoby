-- Editable profiles: a user-chosen animal, an optional private image, and a
-- server-enforced seven-day nickname cooldown.

alter table public.profiles
  add column if not exists avatar_key text,
  add column if not exists nickname_changed_at timestamptz;

alter table public.profiles
  add constraint profiles_avatar_key_valid
  check (
    avatar_key is null
    or avatar_key in ('fox', 'panda', 'elephant', 'whale', 'rabbit', 'bear', 'tiger', 'deer', 'penguin', 'cat')
  );

create or replace function public.update_my_nickname(p_nickname text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_last_changed_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTH_REQUIRED';
  end if;
  if char_length(v_nickname) not between 2 and 20 or v_nickname !~ '[^[:space:]]' then
    raise exception using errcode = '22023', message = 'INVALID_NICKNAME';
  end if;

  select nickname_changed_at into v_last_changed_at
  from public.profiles
  where id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;
  if v_last_changed_at is not null
    and statement_timestamp() < v_last_changed_at + interval '7 days' then
    raise exception using
      errcode = 'P0001',
      message = 'NICKNAME_COOLDOWN',
      detail = (v_last_changed_at + interval '7 days')::text;
  end if;

  update public.profiles
  set nickname = v_nickname,
      nickname_changed_at = statement_timestamp()
  where id = v_user_id
    and nickname is distinct from v_nickname;
end;
$$;

create or replace function public.update_my_avatar(
  p_avatar_key text,
  p_avatar_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTH_REQUIRED';
  end if;
  if p_avatar_key is not null
    and p_avatar_key not in ('fox', 'panda', 'elephant', 'whale', 'rabbit', 'bear', 'tiger', 'deer', 'penguin', 'cat') then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_KEY';
  end if;
  if p_avatar_path is not null and (
    p_avatar_path ~ '(^/|\\.\\.)'
    or split_part(p_avatar_path, '/', 1) <> v_user_id::text
    or split_part(p_avatar_path, '/', 2) = ''
  ) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_PATH';
  end if;

  update public.profiles
  set avatar_key = p_avatar_key,
      avatar_path = p_avatar_path
  where id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

-- Table writes must go through the small, server-validated API above. Keep the
-- notification preference column untouched for its existing caller.
revoke update (nickname, avatar_path) on public.profiles from authenticated;
revoke execute on function public.update_my_nickname(text) from public, anon;
revoke execute on function public.update_my_avatar(text, text) from public, anon;
grant execute on function public.update_my_nickname(text) to authenticated;
grant execute on function public.update_my_avatar(text, text) to authenticated;

-- Other members need profile changes pushed just like room changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel relation
      join pg_publication publication on publication.oid = relation.prpubid
      where publication.pubname = 'supabase_realtime'
        and relation.prrelid = 'public.profiles'::regclass
    ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
