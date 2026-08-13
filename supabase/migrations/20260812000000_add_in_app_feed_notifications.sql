-- 앱 내 소식함: 방의 새 지출을 모든 활성 멤버에게 알린다.
-- 댓글/답글 알림은 기존 RPC가 생성하며, 클라이언트는 expense_id를 기준으로
-- 현재 Expo Router 경로(/expense/:id)로 이동한다.

alter type public.notification_kind add value if not exists 'expense_created';

create function private.enqueue_expense_created_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_recipient record;
begin
  -- 개인 지출과 soft-deleted 지출은 방 피드 소식 대상이 아니다.
  if new.period_id is null or new.deleted_at is not null then
    return new;
  end if;

  select p.room_id into v_room_id
  from public.periods p
  where p.id = new.period_id;
  if v_room_id is null then
    return new;
  end if;

  for v_recipient in
    select rm.user_id
    from public.room_members rm
    where rm.room_id = v_room_id
      and rm.status = 'active'
      and rm.user_id <> new.user_id
  loop
    perform private.enqueue_notification(
      v_recipient.user_id,
      'expense_created',
      new.user_id,
      v_room_id,
      new.period_id,
      new.id,
      null,
      '/expense/' || new.id::text,
      'expense_created:' || new.id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists expenses_enqueue_created_notification on public.expenses;
create trigger expenses_enqueue_created_notification
after insert on public.expenses
for each row execute function private.enqueue_expense_created_notifications();

-- 기존 환경에서 publication 구성이 달라도 소식함 실시간 반영을 보장한다.
do $realtime_setup$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$realtime_setup$;
