-- 방 멤버 전용 커뮤니티. 뒷구매는 expenses와 완전히 분리된 게시글 상세다.

do $$
begin
  create type public.room_post_category as enum (
    'frugality',
    'secret_purchase',
    'chat'
  );
exception
  when duplicate_object then null;
end;
$$;

alter table public.room_posts
  add column if not exists category public.room_post_category,
  add column if not exists title text,
  add column if not exists photo_path text,
  add column if not exists secret_purchase_amount bigint,
  add column if not exists secret_purchase_occurred_at timestamptz,
  add column if not exists secret_purchase_category public.expense_category;

update public.room_posts
set
  category = 'chat',
  title = left(coalesce(nullif(btrim(body), ''), '커뮤니티 글'), 100)
where category is null or title is null;

alter table public.room_posts
  alter column category set not null,
  alter column category set default 'chat',
  alter column title set not null,
  -- 기존 생성 함수가 본문 행을 먼저 만든 뒤 커뮤니티 제목을 채운다.
  alter column title set default '커뮤니티 글';

alter table public.room_posts
  drop constraint if exists room_posts_title_length,
  drop constraint if exists room_posts_secret_purchase_shape,
  add constraint room_posts_title_length check (char_length(btrim(title)) between 1 and 100),
  add constraint room_posts_secret_purchase_shape check (
    (
      category = 'secret_purchase'
      and kind = 'post'
      and secret_purchase_amount > 0
      and secret_purchase_occurred_at is not null
      and secret_purchase_category is not null
    )
    or (
      category <> 'secret_purchase'
      and secret_purchase_amount is null
      and secret_purchase_occurred_at is null
      and secret_purchase_category is null
    )
  );

alter table public.room_post_reactions
  drop constraint room_post_reactions_emoji,
  add constraint room_post_reactions_emoji check (emoji in ('❤️', '👍', '👎', '👏'));

create table if not exists public.room_post_reads (
  post_id uuid not null references public.room_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default statement_timestamp(),
  primary key (post_id, user_id)
);

create index if not exists room_post_reads_user_post_idx on public.room_post_reads(user_id, post_id);
alter table public.room_post_reads enable row level security;
drop policy if exists room_post_reads_read_own on public.room_post_reads;
create policy room_post_reads_read_own on public.room_post_reads
for select to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-post-images', 'room-post-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists room_post_images_read_room_members on storage.objects;
create policy room_post_images_read_room_members
on storage.objects for select to authenticated using (
  bucket_id = 'room-post-images'
  and (
    owner_id = auth.uid()::text
    or exists (
      select 1 from public.room_posts post
      where post.photo_path = storage.objects.name
        and post.deleted_at is null
        and private.is_room_member(post.room_id, auth.uid())
    )
  )
);

drop policy if exists room_post_images_insert_own on storage.objects;
create policy room_post_images_insert_own
on storage.objects for insert to authenticated with check (
  bucket_id = 'room-post-images'
  and name !~ '(^/|\.\.)'
  and split_part(name, '/', 1) = auth.uid()::text
  and split_part(name, '/', 2) <> ''
);

drop policy if exists room_post_images_delete_own on storage.objects;
create policy room_post_images_delete_own
on storage.objects for delete to authenticated using (
  bucket_id = 'room-post-images' and owner_id = auth.uid()::text
);

create or replace function private.add_room_community_post_impl(
  p_room_id uuid,
  p_kind public.room_post_kind,
  p_category public.room_post_category,
  p_title text,
  p_body text,
  p_options text[],
  p_photo_path text,
  p_secret_purchase_amount bigint,
  p_secret_purchase_occurred_at timestamptz,
  p_secret_purchase_category public.expense_category,
  p_client_request_id uuid
)
returns public.room_posts
language plpgsql security definer set search_path = ''
as $$
declare
  v_post public.room_posts%rowtype;
  v_user_id uuid := auth.uid();
begin
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'post title must be 1 to 100 characters';
  end if;
  if p_category = 'secret_purchase' then
    if p_kind <> 'post' or p_secret_purchase_amount is null or p_secret_purchase_amount <= 0
      or p_secret_purchase_occurred_at is null or p_secret_purchase_category is null then
      raise exception using errcode = '22023', message = 'secret purchase requires amount, occurred_at and category';
    end if;
  elsif p_secret_purchase_amount is not null or p_secret_purchase_occurred_at is not null or p_secret_purchase_category is not null then
    raise exception using errcode = '22023', message = 'only secret purchases may include purchase details';
  end if;
  if p_photo_path is not null and position(v_user_id::text || '/' in p_photo_path) <> 1 then
    raise exception using errcode = '22023', message = 'photo path does not belong to the current user';
  end if;

  v_post := private.add_room_post_impl(p_room_id, p_kind, p_body, p_options, p_client_request_id);

  update public.room_posts
  set category = p_category,
      title = btrim(p_title),
      photo_path = p_photo_path,
      secret_purchase_amount = p_secret_purchase_amount,
      secret_purchase_occurred_at = p_secret_purchase_occurred_at,
      secret_purchase_category = p_secret_purchase_category
  where id = v_post.id
  returning * into v_post;
  return v_post;
end;
$$;

drop function if exists public.add_room_post(uuid, public.room_post_kind, text, text[], uuid);

create or replace function public.add_room_post(
  p_room_id uuid,
  p_kind public.room_post_kind,
  p_category public.room_post_category,
  p_title text,
  p_body text,
  p_options text[],
  p_photo_path text,
  p_secret_purchase_amount bigint,
  p_secret_purchase_occurred_at timestamptz,
  p_secret_purchase_category public.expense_category,
  p_client_request_id uuid
)
returns public.room_posts
language sql security invoker set search_path = ''
as $$ select private.add_room_community_post_impl(
  p_room_id, p_kind, p_category, p_title, p_body, p_options, p_photo_path,
  p_secret_purchase_amount, p_secret_purchase_occurred_at, p_secret_purchase_category,
  p_client_request_id
); $$;

create or replace function private.mark_room_post_read_impl(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_room_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select room_id into v_room_id from public.room_posts where id = p_post_id and deleted_at is null;
  if v_room_id is null or not private.is_room_member(v_room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'room membership required';
  end if;
  insert into public.room_post_reads(post_id, user_id) values (p_post_id, v_user_id)
  on conflict (post_id, user_id) do update set read_at = room_post_reads.read_at;
end;
$$;

create or replace function public.mark_room_post_read(p_post_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.mark_room_post_read_impl(p_post_id); $$;

revoke all on function public.add_room_post(uuid, public.room_post_kind, public.room_post_category, text, text, text[], text, bigint, timestamptz, public.expense_category, uuid) from public, anon, service_role;
revoke all on function public.mark_room_post_read(uuid) from public, anon, service_role;
grant execute on function public.add_room_post(uuid, public.room_post_kind, public.room_post_category, text, text, text[], text, bigint, timestamptz, public.expense_category, uuid) to authenticated;
grant execute on function public.mark_room_post_read(uuid) to authenticated;
grant select on public.room_post_reads to authenticated;
