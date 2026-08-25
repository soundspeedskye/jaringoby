create function private.add_comment_with_mentions_impl(
  p_expense_id uuid,
  p_body text,
  p_reply_to_comment_id uuid,
  p_client_request_id uuid,
  p_mentions jsonb
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
  v_mention jsonb;
  v_mentioned_user_id uuid;
  v_start integer;
  v_end integer;
  v_display_name text;
  v_previous_end integer := 0;
  v_recipient_id uuid;
  v_notification_kind public.notification_kind;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id is required';
  end if;
  if p_mentions is null or jsonb_typeof(p_mentions) <> 'array' or jsonb_array_length(p_mentions) > 20 then
    raise exception using errcode = '22023', message = 'mentions must be an array of at most 20 members';
  end if;

  select c.* into v_comment
  from public.comments c
  where c.user_id = v_user_id and c.client_request_id = p_client_request_id;
  if found then return v_comment; end if;

  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'comment body must be 1 to 500 characters excluding surrounding whitespace';
  end if;

  select e.* into v_expense from public.expenses e where e.id = p_expense_id;
  if v_expense.id is null or v_expense.period_id is null or v_expense.deleted_at is not null then
    raise exception using errcode = '22023', message = 'comments require a visible period expense';
  end if;
  select p.* into strict v_period from public.periods p where p.id = v_expense.period_id;
  if statement_timestamp() < v_period.starts_at or statement_timestamp() >= v_period.finalizes_at
     or not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'comments are not writable for this member';
  end if;

  if p_reply_to_comment_id is not null then
    select c.* into v_parent from public.comments c where c.id = p_reply_to_comment_id;
    if v_parent.id is null or v_parent.expense_id <> p_expense_id then
      raise exception using errcode = '22023', message = 'reply target must be a comment on the same expense';
    end if;
  end if;

  for v_mention in select value from jsonb_array_elements(p_mentions) loop
    begin
      v_mentioned_user_id := (v_mention->>'user_id')::uuid;
      v_start := (v_mention->>'start_offset')::integer;
      v_end := (v_mention->>'end_offset')::integer;
      v_display_name := v_mention->>'display_name';
    exception when others then
      raise exception using errcode = '22023', message = 'invalid mention';
    end;
    if v_mentioned_user_id = v_user_id or v_start < v_previous_end or v_end <= v_start
       or v_display_name is null or char_length(v_display_name) not between 1 and 40
       or substr(btrim(p_body), v_start + 1, v_end - v_start) <> '@' || v_display_name
       or not private.is_active_room_member(v_period.room_id, v_mentioned_user_id) then
      raise exception using errcode = '22023', message = 'invalid mention';
    end if;
    v_previous_end := v_end;
  end loop;

  insert into public.comments (expense_id, user_id, reply_to_comment_id, body, client_request_id)
  values (p_expense_id, v_user_id, p_reply_to_comment_id, btrim(p_body), p_client_request_id)
  on conflict (user_id, client_request_id) do nothing
  returning * into v_comment;

  if v_comment.id is null then
    select c.* into strict v_comment
    from public.comments c
    where c.user_id = v_user_id and c.client_request_id = p_client_request_id;
    return v_comment;
  end if;

  for v_mention in select value from jsonb_array_elements(p_mentions) loop
    insert into public.comment_mentions (comment_id, mentioned_user_id, start_offset, end_offset, display_name)
    values (
      v_comment.id,
      (v_mention->>'user_id')::uuid,
      (v_mention->>'start_offset')::integer,
      (v_mention->>'end_offset')::integer,
      v_mention->>'display_name'
    );
  end loop;

  for v_recipient_id, v_notification_kind in
    select distinct on (recipient_id) recipient_id, kind
    from (
      select v_expense.user_id as recipient_id, 'expense_comment'::public.notification_kind as kind, 1 as priority
      union all
      select v_parent.user_id, 'comment_reply'::public.notification_kind, 2 where p_reply_to_comment_id is not null
      union all
      select (value->>'user_id')::uuid, 'comment_mention'::public.notification_kind, 3
      from jsonb_array_elements(p_mentions)
    ) recipients
    where recipient_id is distinct from v_user_id
    order by recipient_id, priority desc
  loop
    perform private.enqueue_notification(
      v_recipient_id, v_notification_kind, v_user_id, v_period.room_id, v_period.id, v_expense.id, v_comment.id,
      '/rooms/' || v_period.room_id::text || '/periods/' || v_period.id::text || '/expenses/' || v_expense.id::text,
      'comment_notification:' || v_comment.id::text || ':' || v_recipient_id::text
    );
  end loop;

  perform private.write_audit_event(v_user_id, 'comment.created', 'comment', v_comment.id,
    jsonb_build_object('expense_id', p_expense_id, 'reply_to_comment_id', p_reply_to_comment_id, 'mention_count', jsonb_array_length(p_mentions)));
  return v_comment;
end;
$$;

create function public.add_comment_with_mentions(
  p_expense_id uuid,
  p_body text,
  p_reply_to_comment_id uuid,
  p_client_request_id uuid,
  p_mentions jsonb
)
returns public.comments
language sql
security invoker
set search_path = ''
as $$
  select private.add_comment_with_mentions_impl(
    p_expense_id, p_body, p_reply_to_comment_id, p_client_request_id, p_mentions
  );
$$;

revoke all on function private.add_comment_with_mentions_impl(uuid, text, uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.add_comment_with_mentions_impl(uuid, text, uuid, uuid, jsonb)
  to authenticated;
revoke execute on function public.add_comment_with_mentions(uuid, text, uuid, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.add_comment_with_mentions(uuid, text, uuid, uuid, jsonb)
  to authenticated;

create or replace function private.update_comment_impl(
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
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'comment body must be 1 to 500 characters';
  end if;
  select c.* into v_comment from public.comments c where c.id = p_comment_id for update;
  if v_comment.id is null or v_comment.user_id <> v_user_id then raise exception using errcode = '42501', message = 'comment not found or not owned by current user'; end if;
  if v_comment.deleted_at is not null then raise exception using errcode = '22023', message = 'deleted comment cannot be edited'; end if;
  if v_comment.version <> p_expected_version then raise exception using errcode = '40001', message = 'comment version conflict'; end if;
  select p.* into strict v_period from public.periods p join public.expenses e on e.period_id = p.id where e.id = v_comment.expense_id;
  if statement_timestamp() >= v_period.finalizes_at or not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'comment is read-only';
  end if;
  delete from public.comment_mentions where comment_id = p_comment_id;
  update public.comments set body = btrim(p_body), version = version + 1, edited_at = statement_timestamp()
  where id = p_comment_id returning * into v_comment;
  perform private.write_audit_event(v_user_id, 'comment.updated', 'comment', v_comment.id,
    jsonb_build_object('version', v_comment.version, 'mentions_cleared', true));
  return v_comment;
end;
$$;
