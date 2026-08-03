-- Room owners may permanently remove one archived weekly record. Active or
-- settling periods are deliberately excluded from this destructive action.

create function private.delete_archived_period_impl(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select p.* into v_period
  from public.periods p
  join public.rooms r on r.id = p.room_id
  where p.id = p_period_id
    and r.owner_id = v_user_id
  for update of p;

  if v_period.id is null then
    raise exception using errcode = '42501', message = 'only the current room owner can delete an archived period';
  end if;
  if v_period.finalized_at is null then
    raise exception using errcode = '22023', message = 'only archived periods can be deleted';
  end if;

  -- Preserve no orphaned photos while removing the rows that reference them.
  delete from storage.objects o
  using public.expenses e
  where e.period_id = v_period.id
    and e.photo_path is not null
    and o.bucket_id = 'expense-photos'
    and o.name = e.photo_path;

  -- Clear any reply that points to a comment being removed first, including a
  -- malformed cross-expense reply that would otherwise violate the FK.
  update public.comments c
  set reply_to_comment_id = null
  where c.reply_to_comment_id in (
    select id from public.comments where expense_id in (
      select id from public.expenses where period_id = v_period.id
    )
  );

  delete from public.comments
  where expense_id in (
    select id from public.expenses where period_id = v_period.id
  );
  delete from public.expenses where period_id = v_period.id;
  delete from public.periods where id = v_period.id;

  perform private.write_audit_event(
    v_user_id,
    'period.deleted',
    'period',
    p_period_id,
    jsonb_build_object('room_id', v_period.room_id, 'week_index', v_period.week_index)
  );
end;
$$;

create function public.delete_archived_period(p_period_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_archived_period_impl(p_period_id);
$$;

revoke execute on function private.delete_archived_period_impl(uuid)
from public, anon, service_role;
revoke execute on function public.delete_archived_period(uuid)
from public, anon, service_role;

grant execute on function private.delete_archived_period_impl(uuid) to authenticated;
grant execute on function public.delete_archived_period(uuid) to authenticated;
