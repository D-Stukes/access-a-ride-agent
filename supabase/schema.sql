-- =====================================================================
-- Ride Assure v2: SIMULATED Access-A-Ride dispatch system (demo only)
-- Every person, vendor, driver, ID, and trip in this database is made up.
-- Not affiliated with the MTA or Access-A-Ride.
--
-- Run this first in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Then run seed.sql.
-- =====================================================================

-- ---------- Vendors, drivers, vans ----------------------------------
create table vendors (
  id          serial primary key,
  name        text not null unique,          -- invented names only
  dispatch_phone text not null                 -- fake 555 numbers
);

create table drivers (                         -- 18 per vendor, to cover 15 vans across shifts
  id          serial primary key,
  vendor_id   int not null references vendors(id),
  first_name  text not null,                   -- first name only; reports stay at vendor level
  driver_code text not null unique             -- e.g. BB-D2
);

create table vehicles (                        -- 15 vans per vendor
  id          serial primary key,
  vendor_id   int not null references vendors(id),
  van_number  text not null unique,            -- e.g. BB-114
  has_lift    boolean not null default true
);

-- ---------- Customers (riders) --------------------------------------
create table customers (
  id              serial primary key,
  aar_id          text not null unique,        -- AAR's term; 6 digits in this demo
  first_name      text not null,
  last_name       text not null,
  date_of_birth   date not null,               -- second check when someone calls
  home_area       text not null,               -- an intersection, never a real home address
  zip             text not null,
  home_lat        double precision not null,
  home_lng        double precision not null,
  mobility_needs  text not null,               -- e.g. "wheelchair; needs door-to-door help"
  phone           text not null,               -- fake 555 numbers
  emergency_contact text not null              -- e.g. "Dana (daughter) 718-555-0142"
);

-- ---------- Trips and their timelines -------------------------------
create type trip_status as enum (
  'scheduled', 'en_route', 'arrived', 'picked_up', 'completed',
  'left_without_rider',   -- van left before the rider boarded
  'vehicle_no_show',      -- van never came
  'rider_no_show',        -- rider wasn't there (driver waited)
  'cancelled'
);

create table trips (
  id                serial primary key,
  trip_id           text not null unique,      -- the number AAR gives you per trip (5 digits here)
  customer_id       int not null references customers(id),
  vendor_id         int not null references vendors(id),
  vehicle_id        int references vehicles(id),
  driver_id         int references drivers(id),
  scheduled_pickup  timestamptz not null,      -- start of the 30-minute window
  pickup_area       text not null,
  dropoff_name      text not null,
  pickup_lat        double precision not null,
  pickup_lng        double precision not null,
  dropoff_lat       double precision not null,
  dropoff_lng       double precision not null,
  status            trip_status not null default 'scheduled',
  actual_arrival    timestamptz,               -- null = never arrived (or not yet)
  actual_departure  timestamptz,
  driver_called     boolean,                   -- did the driver call or come to the door
  driver_assisted   boolean,
  route             jsonb,                     -- [[lat,lng], ...] for the live map (filled in stage 3)
  reassigned_from_vendor_id int references vendors(id)  -- AAR moved this trip to another vendor
);
create index on trips (customer_id, scheduled_pickup);
create index on trips (vendor_id, scheduled_pickup);

create table trip_events (
  id          serial primary key,
  trip_id     int not null references trips(id),
  event_type  text not null,                   -- dispatched, en_route, arrived, departed, picked_up, completed, vehicle_no_show
  occurred_at timestamptz not null,
  details     text
);
create index on trip_events (trip_id, occurred_at);

-- ---------- Van runs: shared rides, in stop order --------------------
-- Each van does a morning and/or afternoon run. A run is an ordered list of
-- pickups and drop-offs. Only the demo vans get full stop lists.
create table runs (
  id         serial primary key,
  vehicle_id int not null references vehicles(id),
  driver_id  int not null references drivers(id),
  run_date   date not null,
  shift      text not null check (shift in ('AM', 'PM')),
  unique (vehicle_id, run_date, shift)
);

create table run_stops (
  id           serial primary key,
  run_id       int not null references runs(id),
  seq          int not null,                   -- 1, 2, 3... the order the van makes its stops
  stop_type    text not null check (stop_type in ('pickup', 'dropoff')),
  trip_id      int not null references trips(id),
  planned_time timestamptz not null,
  completed_at timestamptz,                    -- null = not done yet
  unique (run_id, seq)
);

-- ---------- Complaints already on file ------------------------------
create table complaints (
  id               serial primary key,
  complaint_number text not null unique,       -- e.g. C-24017
  customer_id      int not null references customers(id),
  trip_id          int references trips(id),
  vendor_id        int not null references vendors(id),
  category         text not null,              -- late, left_without_rider, no_assist, vehicle_no_show, other
  description      text not null,
  filed_at         timestamptz not null,
  status           text not null,              -- open, resolved, no_response
  resolution       text
);

-- ---------- Calls to the simulated AAR rep --------------------------
create table calls (
  id               serial primary key,
  ticket_number    text not null unique default ('T-' || lpad((floor(random()*90000)+10000)::int::text, 5, '0')),
  customer_id      int references customers(id),  -- null until the caller is verified
  caller_relation  text not null default 'self',  -- self, daughter, son, aide, coordinator...
  verified         boolean not null default false,
  verify_attempts  int not null default 0,
  trip_id          int references trips(id),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  summary          text,
  outcome          text,
  transcript       jsonb not null default '[]'::jsonb
);

create table vendor_contacts (
  id            serial primary key,
  call_id       int not null references calls(id),
  vendor_id     int not null references vendors(id),
  trip_id       int not null references trips(id),
  request       text not null,                 -- e.g. "driver call-out and door assist"
  response      text,                          -- what the vendor said
  requested_at  timestamptz not null default now(),
  responded_at  timestamptz
);

-- ---------- The rep's standard answers ------------------------------
create table faq (
  id        serial primary key,
  topic     text not null unique,
  question  text not null,
  answer    text not null
);

-- ---------- Live van positions for the map --------------------------
create table vehicle_positions (
  vehicle_id   int primary key references vehicles(id),
  trip_id      int references trips(id),
  lat          double precision not null,
  lng          double precision not null,
  eta_minutes  int,
  updated_at   timestamptz not null default now()
);

-- =====================================================================
-- Verification: the ONLY way to turn an AAR ID into a customer record.
-- There is no lookup by name. Wrong answers count toward a 3-try limit
-- per call, and nothing about the account is returned unless both match.
-- =====================================================================
create or replace function verify_caller(p_call_id int, p_aar_id text, p_dob date)
returns table (verified boolean, attempts_left int, first_name text)
language plpgsql security definer set search_path = public as $$
declare
  c        calls%rowtype;
  cust     customers%rowtype;
  clean_id text := regexp_replace(coalesce(p_aar_id, ''), '\D', '', 'g');  -- "RA 100-234" -> "100234"
begin
  select * into c from calls where id = p_call_id for update;
  if not found then raise exception 'unknown call'; end if;
  if c.verified then
    return query select true, 0, (select cu.first_name from customers cu where cu.id = c.customer_id);
    return;
  end if;
  if c.verify_attempts >= 3 then
    return query select false, 0, null::text; return;
  end if;

  select * into cust from customers where aar_id = clean_id and date_of_birth = p_dob;
  if found then
    update calls set verified = true, customer_id = cust.id, verify_attempts = c.verify_attempts + 1
      where id = p_call_id;
    return query select true, 3 - (c.verify_attempts + 1), cust.first_name;
  else
    update calls set verify_attempts = c.verify_attempts + 1 where id = p_call_id;
    return query select false, 3 - (c.verify_attempts + 1), null::text;
  end if;
end $$;

-- =====================================================================
-- Ride progress for ONE rider's trip: counts and order only. It never
-- returns other passengers' names or locations.
--   before pickup: how many stops the van makes before reaching you
--   on board:      how many drop-offs come before yours, and your number
-- =====================================================================
create or replace function ride_progress(p_trip_id int)
returns table (
  phase                text,  -- not_on_a_run, waiting_for_pickup, on_board, dropped_off
  stops_before_pickup  int,
  passengers_on_board  int,
  dropoffs_before_mine int,
  my_dropoff_number    int,
  eta_pickup           timestamptz,
  eta_dropoff          timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  my_pick run_stops%rowtype;
  my_drop run_stops%rowtype;
begin
  select * into my_pick from run_stops where trip_id = p_trip_id and stop_type = 'pickup';
  select * into my_drop from run_stops where trip_id = p_trip_id and stop_type = 'dropoff';
  if my_pick.id is null or my_drop.id is null then
    return query select 'not_on_a_run'::text, null::int, null::int, null::int, null::int,
                        null::timestamptz, null::timestamptz;
    return;
  end if;

  return query
  with s as (select * from run_stops where run_id = my_pick.run_id)
  select
    case when my_drop.completed_at is not null then 'dropped_off'
         when my_pick.completed_at is not null then 'on_board'
         else 'waiting_for_pickup' end,
    -- stops still to make before my pickup
    (select count(*)::int from s where s.seq < my_pick.seq and s.completed_at is null),
    -- people in the van right now (picked up, not yet dropped off)
    ((select count(*) from s where s.stop_type = 'pickup'  and s.completed_at is not null)
   - (select count(*) from s where s.stop_type = 'dropoff' and s.completed_at is not null))::int,
    -- drop-offs still to make before mine
    (select count(*)::int from s where s.stop_type = 'dropoff' and s.seq < my_drop.seq and s.completed_at is null),
    -- my place among all drop-offs on this run (1 = first)
    (select count(*)::int from s where s.stop_type = 'dropoff' and s.seq <= my_drop.seq),
    my_pick.planned_time,
    my_drop.planned_time;
end $$;

-- =====================================================================
-- Security. Riders' data (even fake) is never readable from the browser.
-- The rep's server functions use the service_role key and check that the
-- call is verified before reading anything. The browser (anon key) may only
-- read van positions (for the map) and the FAQ.
-- =====================================================================
alter table vendors           enable row level security;
alter table drivers           enable row level security;
alter table vehicles          enable row level security;
alter table customers         enable row level security;
alter table trips             enable row level security;
alter table trip_events       enable row level security;
alter table complaints        enable row level security;
alter table calls             enable row level security;
alter table vendor_contacts   enable row level security;
alter table faq               enable row level security;
alter table runs              enable row level security;
alter table run_stops         enable row level security;
alter table vehicle_positions enable row level security;

create policy "map can read van positions" on vehicle_positions for select to anon, authenticated using (true);
create policy "anyone can read the FAQ"   on faq               for select to anon, authenticated using (true);

revoke execute on function verify_caller(int, text, date) from public, anon, authenticated;
grant  execute on function verify_caller(int, text, date) to service_role;
revoke execute on function ride_progress(int) from public, anon, authenticated;
grant  execute on function ride_progress(int) to service_role;

-- Live map: push van position changes to the browser instantly.
alter publication supabase_realtime add table vehicle_positions;
