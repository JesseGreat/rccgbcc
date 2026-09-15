-- is_attendance_open() boundaries, countdown state, and closed-window rejection.
begin;
\ir setup/fixtures.sql

-- Default window: Sunday 08:00–08:40 Africa/Lagos (UTC+1). 2026-09-13 is a Sunday.
select pg_temp.assert(not public.is_attendance_open_at('2026-09-13 07:59:59+01'), '07:59:59 Sunday is closed');
select pg_temp.assert(    public.is_attendance_open_at('2026-09-13 08:00:00+01'), '08:00:00 Sunday is open');
select pg_temp.assert(    public.is_attendance_open_at('2026-09-13 08:39:59+01'), '08:39:59 Sunday is open');
select pg_temp.assert(    public.is_attendance_open_at('2026-09-13 08:39:59.999999+01'), 'last microsecond before 08:40 is open');
select pg_temp.assert(not public.is_attendance_open_at('2026-09-13 08:40:00+01'), '08:40:00 Sunday is closed');
select pg_temp.assert(not public.is_attendance_open_at('2026-09-14 08:10:00+01'), 'Monday 08:10 is closed');
select pg_temp.assert(not public.is_attendance_open_at('2026-09-12 08:10:00+01'), 'Saturday 08:10 is closed');

-- The instant is converted to Lagos time; the session/client timezone is irrelevant.
select pg_temp.assert(    public.is_attendance_open_at('2026-09-13 07:10:00+00'), '07:10 UTC = 08:10 Lagos is open');
select pg_temp.assert(not public.is_attendance_open_at('2026-09-13 08:10:00+00'), '08:10 UTC = 09:10 Lagos is closed');
set local timezone = 'America/New_York';
select pg_temp.assert(    public.is_attendance_open_at('2026-09-13 03:10:00-04'), 'session timezone does not affect the result');
reset timezone;

-- Countdown state.
select pg_temp.assert(
  (public.attendance_window_state_at('2026-09-13 07:45:00+01') ->> 'seconds_until_open')::int = 900,
  '15 minutes before opening -> 900 seconds until open');
select pg_temp.assert(
  (public.attendance_window_state_at('2026-09-13 07:45:00+01') ->> 'is_open')::boolean = false,
  'before opening -> is_open false');
select pg_temp.assert(
  (public.attendance_window_state_at('2026-09-13 08:39:00+01') ->> 'seconds_until_close')::int = 60,
  'one minute before closing -> 60 seconds until close');
select pg_temp.assert(
  (public.attendance_window_state_at('2026-09-13 08:40:00+01') ->> 'opens_at')::timestamptz = '2026-09-20 08:00:00+01',
  'at closing time the next window is the following Sunday');
select pg_temp.assert(
  (public.attendance_window_state_at('2026-09-14 12:00:00+01') ->> 'opens_at')::timestamptz = '2026-09-20 08:00:00+01',
  'Monday -> next Sunday');
select pg_temp.assert(
  (public.attendance_window_state_at('2026-09-13 08:40:00+01') ->> 'seconds_until_close') is null,
  'closed -> seconds_until_close is null');

-- Settings changes are honoured: move the window to Saturday 17:00–18:00.
update public.app_settings set service_dow = 6, window_start = '17:00', window_end = '18:00' where id = 1;
select pg_temp.assert(    public.is_attendance_open_at('2026-09-12 17:30:00+01'), 'custom window: Saturday 17:30 open');
select pg_temp.assert(not public.is_attendance_open_at('2026-09-13 08:10:00+01'), 'custom window: Sunday 08:10 closed');

-- Bad settings are rejected.
do $$
begin
  begin
    update public.app_settings set timezone = 'Mars/Olympus_Mons' where id = 1;
    raise exception 'ASSERTION FAILED: invalid timezone accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.app_settings set window_start = '09:00', window_end = '08:00' where id = 1;
    raise exception 'ASSERTION FAILED: inverted window accepted';
  exception when check_violation then null;
  end;
end
$$;

-- Hard lock: with the window closed, every student RPC raises WINDOW_CLOSED (AW001)
-- and nothing is written.
select pg_temp.close_window();
set local role service_role;
reset "request.jwt.claims";

do $$
begin
  begin
    perform public.mark_attendance('00000000-0000-0000-0000-0000000005a1', 'device-aaaaaaaaaaaaaaaa');
    raise exception 'ASSERTION FAILED: mark_attendance succeeded while closed';
  exception when sqlstate 'AW001' then null;
  end;
  begin
    perform public.add_student('00000000-0000-0000-0000-0000000000c1', 'Brand New', null, 'device-aaaaaaaaaaaaaaaa');
    raise exception 'ASSERTION FAILED: add_student succeeded while closed';
  exception when sqlstate 'AW001' then null;
  end;
  begin
    perform public.search_students('00000000-0000-0000-0000-0000000000c1', 'chidi');
    raise exception 'ASSERTION FAILED: search_students succeeded while closed';
  exception when sqlstate 'AW001' then null;
  end;
end
$$;

select pg_temp.assert((public.get_classes() -> 'window' ->> 'is_open')::boolean = false,
  'get_classes works while closed and reports is_open = false');
select pg_temp.assert(jsonb_array_length(public.get_classes() -> 'classes') = 2,
  'get_classes lists only active classes');
reset role;

select pg_temp.assert((select count(*) from public.attendance) = 0, 'nothing written while closed');
select pg_temp.assert((select count(*) from public.students where full_name = 'Brand New') = 0, 'no student created while closed');

select pg_temp.open_window();
select pg_temp.assert(public.is_attendance_open(), 'open_window() helper opens the window');

rollback;
