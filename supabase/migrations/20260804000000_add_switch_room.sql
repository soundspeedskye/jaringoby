-- §3.6 방 전환: 현재 방을 나가고 다른 방에 참여하는 동작을 한 트랜잭션으로 묶는다.
-- 이용자는 항상 활성 방을 하나만 가지므로, 다른 방 코드로 옮겨가려면 현재 방을
-- 반드시 떠나야 한다. leave와 join을 각각 따로 호출하면 join이 실패했을 때
-- (정원 초과·잘못된 코드·재참여 차단) 이미 나간 방으로 되돌아올 수 없어
-- 무소속 상태에 빠진다. 하나의 함수(=하나의 트랜잭션)로 묶어, join이 실패하면
-- leave까지 통째로 롤백되어 이용자는 원래 방에 그대로 남는다.
--
-- 두 하위 로직은 기존 impl을 그대로 재사용한다. 재참여 차단 정책(한 번 나간 방은
-- 다시 못 들어옴)은 join_room_impl에 이미 있으므로 여기서 추가로 다루지 않는다.

create function private.switch_room_impl(
  p_leave_room_id uuid,
  p_successor_user_id uuid,
  p_join_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left public.room_members%rowtype;
  v_join jsonb;
  v_error_code text;
begin
  -- 1) 현재 방 나가기. 방장이면 후계자 지정이 강제되고, 활성 멤버가 아니거나
  --    후계자 조건을 못 채우면 여기서 예외가 나 전체가 롤백된다.
  v_left := private.leave_room_impl(p_leave_room_id, p_successor_user_id);

  -- 2) 대상 방 참여. join_room_impl은 실패를 예외 대신 {ok:false, error_code}로
  --    돌려주므로, 실패 코드를 예외로 승격시켜 1)의 나가기까지 롤백되게 한다.
  v_join := private.join_room_impl(p_join_code);

  if coalesce((v_join->>'ok')::boolean, false) is not true then
    v_error_code := coalesce(v_join->>'error_code', 'UNKNOWN');
    raise exception using
      errcode = '22023',
      message = 'switch_room join failed: ' || v_error_code;
  end if;

  return jsonb_build_object(
    'ok', true,
    'left', to_jsonb(v_left),
    'join', v_join
  );
end;
$$;

create function public.switch_room(
  p_leave_room_id uuid,
  p_successor_user_id uuid,
  p_join_code text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.switch_room_impl(p_leave_room_id, p_successor_user_id, p_join_code);
$$;

grant execute on function private.switch_room_impl(uuid, uuid, text) to authenticated;
revoke execute on function public.switch_room(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.switch_room(uuid, uuid, text) to authenticated;
