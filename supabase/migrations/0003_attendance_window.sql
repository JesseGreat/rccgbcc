-- 0003: the attendance window. The database clock is the only source of truth.
-- Idempotent.

-- Is the window open at a given instant? Pure function of app_settings + p_at,
-- which makes the boundaries directly testable.
create or replace function public.is_attendance_open_at(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extract(dow from l.local_ts)::int = s.service_dow
       and l.local_ts::time >= s.window_start
       and l.local_ts::time <  s.window_end
    from public.app_settings s
    cross join lateral (select p_at at time zone s.timezone as local_ts) l
    where s.id = 1
  ), false)
$$;

-- Is the window open right now (server time)?
create or replace function public.is_attendance_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_attendance_open_at(now())
$$;

-- The calendar date in the configured timezone (Africa/Lagos by default).
create or replace function public.current_service_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone s.timezone)::date from public.app_settings s where s.id = 1),
    (now() at time zone 'Africa/Lagos')::date
  )
$$;

-- Full window state at an instant, for countdowns. Shape:
-- { is_open, now, service_date, timezone, service_dow, window_start, window_end,
--   opens_at, closes_at, seconds_until_open, seconds_until_close }
-- When open: opens_at/closes_at are today's window and seconds_until_open = 0.
-- When closed: opens_at/closes_at are the next window and seconds_until_close is null.
create or replace function public.attendance_window_state_at(p_at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s          public.app_settings;
  v_local    timestamp;
  v_today    date;
  v_days     int;
  v_is_open  boolean;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
begin
  select * into s from public.app_settings where id = 1;
  if not found then
    return jsonb_build_object('is_open', false, 'now', p_at);
  end if;

  v_local   := p_at at time zone s.timezone;
  v_today   := v_local::date;
  v_is_open := public.is_attendance_open_at(p_at);

  -- Days until the next service day (0 = today).
  v_days := (s.service_dow - extract(dow from v_today)::int + 7) % 7;
  if v_days = 0 and v_local::time >= s.window_end then
    v_days := 7;
  end if;

  v_opens_at  := ((v_today + v_days) + s.window_start) at time zone s.timezone;
  v_closes_at := ((v_today + v_days) + s.window_end) at time zone s.timezone;

  return jsonb_build_object(
    'is_open', v_is_open,
    'now', p_at,
    'service_date', v_today,
    'timezone', s.timezone,
    'service_dow', s.service_dow,
    'window_start', to_char(s.window_start, 'HH24:MI'),
    'window_end', to_char(s.window_end, 'HH24:MI'),
    'opens_at', v_opens_at,
    'closes_at', v_closes_at,
    'seconds_until_open',
      case when v_is_open then 0
           else greatest(0, ceil(extract(epoch from (v_opens_at - p_at))))::int end,
    'seconds_until_close',
      case when v_is_open then ceil(extract(epoch from (v_closes_at - p_at)))::int
           else null end
  );
end;
$$;

create or replace function public.attendance_window_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.attendance_window_state_at(now())
$$;
