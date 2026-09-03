-- 앱 이름이 zaringovy로 바뀌었는데 cron 잡 이름만 옛 이름으로 남아 있었다.
-- 잡 이름은 pg_cron이 잡을 식별하는 키다. 나중에 이 잡을 손보는 마이그레이션이
-- 새 이름으로 존재 여부를 가드하면 기존 잡을 찾지 못해 같은 함수가 이중으로
-- 스케줄된다. 정산이 매분 두 번 도는 사고를 막으려면 이름을 맞춰둬야 한다.
--
-- 걷어내기와 등록을 분리해 부분 적용 상태(옛 이름과 새 이름이 함께 존재)에서도
-- 중복이 남지 않게 한다. 한 트랜잭션 안에서 끝나므로 실행 공백은 없고,
-- 다시 실행해도 아무 일도 일어나지 않는다.

do $cron_rename$
begin
  if exists (
    select 1 from cron.job where jobname = 'jaringoby-finalize-due-periods'
  ) then
    perform cron.unschedule('jaringoby-finalize-due-periods');
  end if;

  if exists (
    select 1 from cron.job where jobname = 'jaringoby-roll-rooms-forward'
  ) then
    perform cron.unschedule('jaringoby-roll-rooms-forward');
  end if;

  if not exists (
    select 1 from cron.job where jobname = 'zaringovy-finalize-due-periods'
  ) then
    perform cron.schedule(
      'zaringovy-finalize-due-periods',
      '* * * * *',
      'select private.finalize_due_periods(100);'
    );
  end if;

  if not exists (
    select 1 from cron.job where jobname = 'zaringovy-roll-rooms-forward'
  ) then
    perform cron.schedule(
      'zaringovy-roll-rooms-forward',
      '* * * * *',
      'select private.roll_rooms_forward(100);'
    );
  end if;
end
$cron_rename$;
