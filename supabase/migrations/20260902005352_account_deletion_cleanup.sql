-- Account deletion is performed only by the delete-account Edge Function after
-- it has re-authenticated the caller with their current password.  This RPC is
-- deliberately service-role only: it removes data spanning several rooms and
-- must never be callable through the public Data API.

create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room record;
  v_successor_id uuid;
  v_successor_is_active boolean;
  v_rooms_without_successor uuid[] := '{}';
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user id is required';
  end if;

  -- A room must always retain a profile owner.  When other people have taken
  -- part in a room, hand ownership to the earliest active member.  If everyone
  -- else has already left, retain the room as closed under the earliest former
  -- participant so their past record remains readable.  A room with no other
  -- participant at all is safe to remove completely later in this transaction.
  for v_room in
    select r.id, r.creator_id, r.owner_id
    from public.rooms r
    where r.owner_id = p_user_id
    for update
  loop
    select candidate.user_id, candidate.is_active
      into v_successor_id, v_successor_is_active
    from (
      select m.user_id, (m.status = 'active') as is_active, m.joined_at, 1 as priority
      from public.room_members m
      where m.room_id = v_room.id
        and m.user_id <> p_user_id
      union all
      select pm.user_id, false, pm.joined_at, 2 as priority
      from public.period_members pm
      join public.periods p on p.id = pm.period_id
      where p.room_id = v_room.id
        and pm.user_id <> p_user_id
      union all
      select pr.user_id, false, pr.created_at, 3 as priority
      from public.period_results pr
      where pr.room_id = v_room.id
        and pr.user_id <> p_user_id
      union all
      select e.user_id, false, e.created_at, 4 as priority
      from public.expenses e
      join public.periods p on p.id = e.period_id
      where p.room_id = v_room.id
        and e.user_id <> p_user_id
    ) candidate
    join public.profiles profile on profile.id = candidate.user_id
    order by candidate.is_active desc, candidate.priority, candidate.joined_at, candidate.user_id
    limit 1;

    if v_successor_id is null then
      v_rooms_without_successor := array_append(v_rooms_without_successor, v_room.id);
      continue;
    end if;

    -- Drop the deleting active owner's role before making another active member
    -- an owner; room_members has a partial unique index for that invariant.
    update public.room_members
    set role = 'member'
    where room_id = v_room.id
      and user_id = p_user_id
      and role = 'owner';

    update public.room_members
    set role = 'owner'
    where room_id = v_room.id
      and user_id = v_successor_id;

    update public.rooms
    set owner_id = v_successor_id,
        creator_id = case
          when creator_id = p_user_id then v_successor_id
          else creator_id
        end,
        status = case
          when v_successor_is_active then status
          else 'closed'::public.room_status
        end,
        closed_at = case
          when v_successor_is_active then closed_at
          else coalesce(closed_at, statement_timestamp())
        end
    where id = v_room.id;

    if not v_successor_is_active then
      update public.invite_codes
      set is_active = false,
          revoked_at = statement_timestamp()
      where room_id = v_room.id
        and is_active;
    end if;
  end loop;

  -- If the account created a room but no longer owns it, the current owner is
  -- the appropriate non-identifying replacement for the creator reference.
  update public.rooms
  set creator_id = owner_id
  where creator_id = p_user_id
    and owner_id <> p_user_id;

  -- Remove private operational traces as part of the permanent-deletion
  -- promise.  This function intentionally does not write a new audit event.
  delete from private.invite_code_attempts where user_id = p_user_id;
  delete from private.audit_events where actor_id = p_user_id;

  -- Reports made by, about, or tied to the deleting account's content cannot
  -- retain a stable identifier once the account is permanently deleted.
  delete from public.reports report
  where report.reporter_id = p_user_id
    or (report.target_type = 'profile' and report.target_id = p_user_id)
    or report.target_id in (
      select e.id from public.expenses e where e.user_id = p_user_id
    )
    or report.target_id in (
      select c.id from public.comments c where c.user_id = p_user_id
    );

  -- Content and relationship tables with restrictive profile foreign keys must
  -- be cleared before the profile row can disappear.  Deleting an expense also
  -- removes its exception, approval, read, and notification relations by their
  -- existing foreign keys.
  update public.comments
  set reply_to_comment_id = null
  where reply_to_comment_id in (
    select c.id from public.comments c where c.user_id = p_user_id
  );

  delete from public.comment_mentions where mentioned_user_id = p_user_id;
  delete from public.expense_exception_approvals where user_id = p_user_id;
  delete from public.expense_exceptions where requested_by = p_user_id;

  delete from public.comments comment
  where comment.user_id = p_user_id
    or comment.expense_id in (
      select expense.id from public.expenses expense where expense.user_id = p_user_id
    );

  delete from public.room_post_comments where author_id = p_user_id;
  delete from public.room_posts where author_id = p_user_id;
  delete from public.room_post_reactions where user_id = p_user_id;
  delete from public.room_post_reads where user_id = p_user_id;
  delete from public.expense_reads where user_id = p_user_id;
  delete from public.comment_reactions where user_id = p_user_id;

  delete from public.expenses where user_id = p_user_id;
  delete from public.period_results where user_id = p_user_id;
  delete from public.period_members where user_id = p_user_id;
  delete from public.user_room_preferences where user_id = p_user_id;
  delete from public.blocks where blocker_id = p_user_id or blocked_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.device_push_tokens where user_id = p_user_id;

  -- The transferable rooms above no longer point at this user.  A room without
  -- any other participant contains only this account's records, so its cascade
  -- is the cleanest permanent deletion.
  if cardinality(v_rooms_without_successor) > 0 then
    delete from public.rooms where id = any(v_rooms_without_successor);
  end if;

  update public.invite_codes invite
  set created_by = room.owner_id
  from public.rooms room
  where invite.room_id = room.id
    and invite.created_by = p_user_id
    and room.owner_id <> p_user_id;

  delete from public.invite_codes where created_by = p_user_id;
  delete from public.room_members where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
