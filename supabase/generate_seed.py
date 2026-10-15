"""
Generates supabase/seed.sql: fake data for the SIMULATED AAR system.

    python3 supabase/generate_seed.py      # rewrites supabase/seed.sql

Same output every time (fixed random seed). All dates are written relative to
"today in New York" at the moment seed.sql runs, so the data never goes stale:
history covers the last ~90 days, and the demo personas have trips today.
"""
import random
from pathlib import Path

random.seed(2026)
OUT = Path(__file__).with_name("seed.sql")
HISTORY_DAYS = 90

# ---------------------------------------------------------------- vendors
# name, code, dispatch phone, behaviour: p_late, p_left_early, p_vehicle_no_show, p_called, p_assist
VENDORS = [
    ("Bluebird Transit",       "BB", "212-555-0110", 0.08, 0.03, 0.01, 0.85, 0.95),
    ("Harborlight Mobility",   "HL", "718-555-0127", 0.34, 0.14, 0.05, 0.40, 0.70),
    ("Sunrise Ride Partners",  "SR", "718-555-0139", 0.17, 0.06, 0.02, 0.70, 0.88),
    ("Ironbridge Paratransit", "IB", "347-555-0152", 0.20, 0.09, 0.03, 0.55, 0.75),
]
VANS_PER_VENDOR = 15
DRIVERS_PER_VENDOR = 18   # enough to cover 15 vans across morning and afternoon shifts
DRIVER_NAMES = ["Andre", "Priya", "Luis", "Grace", "Tomas", "Keisha", "Omar", "Mei", "Victor", "Janelle",
                "Samuel", "Rina", "Dwayne", "Fatima", "Carlos", "Nadia", "Kevin", "Yolanda", "Ravi", "Tanya",
                "Hector", "Ama", "Brian", "Sofia", "Malik", "Joy", "Dmitri", "Alma", "Curtis", "Leticia",
                "Frank", "Imani", "Paolo", "Rochelle", "Jamal", "Eun-ji"]


def van_row(vendor_idx, slot):
    """vehicles.id for a vendor's van slot (0-14)."""
    return vendor_idx * VANS_PER_VENDOR + slot + 1


def driver_row(vendor_idx, slot):
    """drivers.id for a vendor's driver slot (0-17)."""
    return vendor_idx * DRIVERS_PER_VENDOR + slot + 1


def pm_driver_slot(van_slot):
    """Afternoon driver for a van: rotated, so drivers 15-17 cover shifts too."""
    return (van_slot + 3) % DRIVERS_PER_VENDOR

# ---------------------------------------------------------------- customers
# aar_id, first, last, dob, intersection, zip, lat, lng, needs, phone, emergency contact
CUSTOMERS = [
    ("100234", "Rosa", "Tavares", "1948-03-14", "Jamaica Ave & 168th St", "11432", 40.7075, -73.7930,
     "Wheelchair; needs door-to-door help", "718-555-0181", "Elena Tavares (daughter) 718-555-0182"),
    ("100587", "Marcus", "Whitfield", "1952-11-02", "Merrick Blvd & Linden Blvd", "11412", 40.6926, -73.7650,
     "Uses a cane; needs help with steps", "718-555-0190", "Derek Whitfield (son) 347-555-0191"),
    ("101142", "Ana", "Lucero", "1945-07-30", "Hillside Ave & 179th St", "11432", 40.7123, -73.7835,
     "Low vision; driver must come to the door", "718-555-0203", "Dana Lucero (daughter) 718-555-0142"),
    ("101376", "Harold", "Benson", "1940-01-19", "Parsons Blvd & 90th Ave", "11432", 40.7046, -73.8020,
     "Walker; needs help boarding", "718-555-0214", "Ruth Benson (wife) 718-555-0215"),
    ("101829", "Gloria", "Okafor", "1956-05-08", "Guy R Brewer Blvd & 109th Ave", "11433", 40.6935, -73.7870,
     "Wheelchair", "347-555-0226", "Chidi Okafor (son) 347-555-0227"),
    ("102055", "Wei", "Zhang", "1943-09-23", "Northern Blvd & Main St", "11354", 40.7633, -73.8296,
     "Hard of hearing; prefers text or door knock", "718-555-0238", "Lily Zhang (granddaughter) 917-555-0239"),
    ("102418", "Beatrice", "Moreau", "1950-12-01", "Queens Blvd & 63rd Dr", "11374", 40.7290, -73.8620,
     "Uses a cane", "718-555-0240", "Paul Moreau (brother) 718-555-0241"),
    ("102761", "Samuel", "Adeyemi", "1947-04-11", "Sutphin Blvd & Archer Ave", "11435", 40.7006, -73.8077,
     "Wheelchair; needs door-to-door help", "347-555-0252", "Grace Adeyemi (daughter) 347-555-0253"),
    ("103090", "Lorraine", "Fitzgerald", "1938-08-27", "Francis Lewis Blvd & Hillside Ave", "11423", 40.7170, -73.7640,
     "Walker; low vision", "718-555-0264", "Maureen Fitz (aide) 718-555-0265"),
    ("103344", "Jorge", "Castillo", "1959-02-15", "Liberty Ave & 160th St", "11433", 40.6990, -73.7970,
     "Uses a cane", "718-555-0276", "Marisol Castillo (wife) 718-555-0277"),
]

# Other riders: fill the shared vans. They never appear on screen by name.
EXTRA = [("Delores", "Grant"), ("Frank", "Russo"), ("Mabel", "Owens"), ("Ivan", "Petrov"), ("Celia", "Ramos"),
         ("Norman", "Lee"), ("Bernice", "Holt"), ("Kwame", "Asante"), ("Edith", "Klein"), ("Rafael", "Ortiz")]
AREAS = [("Union Tpke & 188th St", "11366", 40.7280, -73.7860), ("Hollis Ave & 205th St", "11412", 40.7060, -73.7520),
         ("Rockaway Blvd & 150th St", "11434", 40.6740, -73.7900), ("Kissena Blvd & 45th Ave", "11355", 40.7520, -73.8170),
         ("Woodhaven Blvd & Jamaica Ave", "11421", 40.6940, -73.8520)]
for k, (fn, ln) in enumerate(EXTRA):
    area = AREAS[k % len(AREAS)]
    CUSTOMERS.append((str(104000 + k * 137), fn, ln, f"19{40 + k}-0{1 + k % 9}-1{k}", area[0], area[1],
                      area[2] + 0.001 * k, area[3] - 0.001 * k, random.choice(["Uses a cane", "Wheelchair", "Walker"]),
                      f"718-555-0{300 + k}", f"Contact {k + 1} 718-555-0{400 + k}"))

# Public places riders travel to.
PLACES = [
    ("Queens Hospital Center", 40.7178, -73.8036),
    ("Jamaica Hospital Medical Center", 40.7008, -73.8160),
    ("Queens Public Library, Central", 40.7060, -73.7965),
    ("Roy Wilkins Park", 40.6880, -73.7690),
    ("Queens Public Library, Flushing", 40.7600, -73.8290),
    ("NewYork-Presbyterian Queens", 40.7473, -73.8253),
    ("Queens Center Mall", 40.7350, -73.8700),
]
PICKUP_TIMES = ["07:30", "08:15", "09:00", "09:30", "10:45", "11:30", "13:00", "14:15", "15:30", "16:45"]


def q(v):
    """SQL literal."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def ts(days_ago, hhmm, plus_min=0):
    """A New York local time, N days before today, as SQL."""
    return f"pg_temp.ny({days_ago}, '{hhmm}', {plus_min})"


lines = []
w = lines.append
w("-- =====================================================================")
w("-- Ride Assure v2: SEED DATA for the simulated AAR system (all fake).")
w("-- Generated by supabase/generate_seed.py. Run after schema.sql.")
w("-- Safe to re-run: it clears the tables first.")
w("-- =====================================================================")
w("begin;")
w("truncate run_stops, runs, vehicle_positions, vendor_contacts, calls, complaints, trip_events, trips,")
w("         customers, vehicles, drivers, vendors, faq restart identity cascade;")
w("")
w("-- New York local time, N days ago, plus M minutes.")
w("create function pg_temp.ny(days_ago int, hhmm text, plus_min int default 0) returns timestamptz")
w("language sql as $$ select ((((now() at time zone 'America/New_York')::date - days_ago) + hhmm::time)")
w("  at time zone 'America/New_York') + make_interval(mins => plus_min) $$;")
w("")

# vendors, drivers, vans
w("insert into vendors (name, dispatch_phone) values")
w(",\n".join(f"  ({q(n)}, {q(p)})" for n, _, p, *_ in VENDORS) + ";")
drivers, vans = [], []
for vi, (_, code, *_r) in enumerate(VENDORS, start=1):
    for k in range(DRIVERS_PER_VENDOR):
        drivers.append((vi, DRIVER_NAMES[((vi - 1) * 9 + k) % len(DRIVER_NAMES)], f"{code}-D{k + 1:02d}"))
    for k in range(VANS_PER_VENDOR):
        vans.append((vi, f"{code}-{101 + k}", k % 4 != 3))  # most vans have a wheelchair lift
w("insert into drivers (vendor_id, first_name, driver_code) values")
w(",\n".join(f"  ({v}, {q(n)}, {q(c)})" for v, n, c in drivers) + ";")
w("insert into vehicles (vendor_id, van_number, has_lift) values")
w(",\n".join(f"  ({v}, {q(n)}, {q(l)})" for v, n, l in vans) + ";")
w("")

# customers
w("insert into customers (aar_id, first_name, last_name, date_of_birth, home_area, zip, home_lat, home_lng,")
w("                       mobility_needs, phone, emergency_contact) values")
w(",\n".join("  (" + ", ".join(q(x) for x in c) + ")" for c in CUSTOMERS) + ";")
w("")

# ---------------------------------------------------------------- trips
trip_rows, event_rows, complaint_rows = [], [], []
next_trip_id = [50000]
complaint_no = [24000]


def new_trip_id():
    next_trip_id[0] += random.randint(3, 19)
    return str(next_trip_id[0])


def add_trip(cust_idx, vendor_idx, days_ago, hhmm, place, outcome=None, trip_id=None, complaint=None,
             van_slot=None, driver_slot=None, reassigned_from=None):
    """outcome: dict that forces late_min / left_early / vehicle_no_show / called / assisted."""
    _, code, _, p_late, p_left, p_vns, p_called, p_assist = VENDORS[vendor_idx]
    van = van_row(vendor_idx, van_slot if van_slot is not None else random.randrange(VANS_PER_VENDOR))
    driver = driver_row(vendor_idx, driver_slot if driver_slot is not None else random.randrange(DRIVERS_PER_VENDOR))
    o = outcome or {}
    tid = trip_id or new_trip_id()
    row_no = len(trip_rows) + 1
    cust = CUSTOMERS[cust_idx]

    if days_ago == 0 and outcome is None:
        status, arr, dep, called, assisted = "scheduled", None, None, None, None
    else:
        vns = o.get("vehicle_no_show", False if outcome else random.random() < p_vns)
        if vns:
            status, arr, dep, called, assisted = "vehicle_no_show", None, None, None, None
        else:
            late = o.get("late_min")
            if late is None:
                late = random.randint(31, 75) if random.random() < p_late else random.randint(-10, 28)
            arr = late
            left_early = o.get("left_early", False if outcome else random.random() < p_left)
            called = o.get("called", True if outcome else random.random() < p_called)
            if left_early:
                status, dep, assisted = "left_without_rider", max(arr, 0) + random.randint(1, 4), None
                called = o.get("called", False)
            else:
                status, dep = "completed", max(arr, 0) + random.randint(5, 12)
                assisted = o.get("assisted", True if outcome else random.random() < p_assist)
    trip_rows.append((row_no, tid, cust_idx + 1, vendor_idx + 1, van, driver, days_ago, hhmm, cust, place,
                      status, arr, dep, called, assisted, reassigned_from))

    # timeline
    if status != "scheduled":
        if reassigned_from is not None:
            event_rows.append((row_no, "reassigned", ts(days_ago, hhmm, -180),
                               f"AAR moved this trip from {VENDORS[reassigned_from][0]} to {VENDORS[vendor_idx][0]}"))
        event_rows.append((row_no, "dispatched", ts(days_ago, hhmm, -45), f"Assigned to {code} van"))
        event_rows.append((row_no, "en_route", ts(days_ago, hhmm, -25), None))
        if status == "vehicle_no_show":
            event_rows.append((row_no, "vehicle_no_show", ts(days_ago, hhmm, 90), "Van never arrived"))
        else:
            event_rows.append((row_no, "arrived", ts(days_ago, hhmm, arr), None))
            if status == "left_without_rider":
                event_rows.append((row_no, "departed", ts(days_ago, hhmm, dep), "Left without rider"))
            else:
                event_rows.append((row_no, "picked_up", ts(days_ago, hhmm, dep), None))
                event_rows.append((row_no, "completed", ts(days_ago, hhmm, dep + random.randint(15, 40)), None))

    # complaints: forced, or ~30% of bad trips
    bad = status in ("vehicle_no_show", "left_without_rider") or (arr is not None and arr > 30) or assisted is False
    if complaint or (complaint is None and bad and days_ago > 0 and random.random() < 0.3):
        cat = ("vehicle_no_show" if status == "vehicle_no_show" else
               "left_without_rider" if status == "left_without_rider" else
               "late" if arr is not None and arr > 30 else "no_assist")
        text = {
            "vehicle_no_show": "The van never came. I waited the full window and missed my appointment.",
            "left_without_rider": "The van left before I could get to the door. Nobody called or knocked.",
            "late": f"The van came {arr} minutes after my pickup time. I missed part of my appointment.",
            "no_assist": "The driver stayed in the van and did not help me board.",
        }[cat]
        status_c, resolution = (complaint or {}).get("status"), (complaint or {}).get("resolution")
        if status_c is None:
            status_c = random.choice(["resolved", "resolved", "no_response", "open"])
            resolution = {"resolved": "Vendor notified; driver retrained.", "no_response": None, "open": None}[status_c]
        complaint_no[0] += random.randint(2, 11)
        complaint_rows.append((f"C-{complaint_no[0]}", cust_idx + 1, row_no, vendor_idx + 1, cat, text,
                               ts(max(days_ago - 1, 0), "17:20", random.randint(0, 120)), status_c, resolution))
    return row_no


# Background history: every rider, ~2 trips a week, each rider mostly uses 1-2 vendors.
for ci in range(10):  # the 10 main riders have history; the extra riders only ride today
    usual = random.sample(range(len(VENDORS)), 2)
    for days_ago in range(HISTORY_DAYS, 0, -1):
        if random.random() < 0.28:
            vendor = usual[0] if random.random() < 0.7 else usual[1]
            moved_from = None
            if vendor in (1, 3) and random.random() < 0.08:   # Harborlight or Ironbridge -> Bluebird or Sunrise
                moved_from, vendor = vendor, random.choice([0, 2])
            add_trip(ci, vendor, days_ago, random.choice(PICKUP_TIMES), random.choice(PLACES),
                     reassigned_from=moved_from)

# Scripted history for the three demo personas (recent, so the rep can mention it).
HL, BB, SR = 1, 0, 2
add_trip(0, HL, 12, "09:30", PLACES[0], {"late_min": 48, "called": False, "assisted": True},
         complaint={"status": "no_response", "resolution": None})
add_trip(0, HL, 5, "09:30", PLACES[0], {"late_min": 12, "left_early": True},
         complaint={"status": "open", "resolution": None})
add_trip(1, SR, 9, "13:00", PLACES[1], {"late_min": 41, "called": True, "assisted": False},
         complaint={"status": "resolved", "resolution": "Vendor notified; driver retrained."})
add_trip(2, HL, 7, "10:45", PLACES[2], {"late_min": 5, "left_early": True, "called": False},
         complaint={"status": "open", "resolution": None})

# Today's shared runs for the demo vans. Each stop is (rider index, pickup time, dropoff time);
# the order lists say which order the van makes the pickups and drop-offs.
run_rows, stop_rows = [], []


def build_run(vendor_idx, van_slot, riders, dropoff_order, demo_trip_ids):
    """riders: [(cust_idx, pickup hhmm, dropoff hhmm, place)], picked up in list order.
    dropoff_order: rider list positions in the order they are dropped off."""
    drv = pm_driver_slot(van_slot)
    run_rows.append((van_row(vendor_idx, van_slot), driver_row(vendor_idx, drv), "PM"))
    run_no = len(run_rows)
    rows = []
    for k, (ci, pick, drop, place) in enumerate(riders):
        rows.append(add_trip(ci, vendor_idx, 0, pick, place, trip_id=demo_trip_ids.get(ci),
                             van_slot=van_slot, driver_slot=drv))
    seq = 0
    for k, (ci, pick, drop, place) in enumerate(riders):
        seq += 1
        stop_rows.append((run_no, seq, "pickup", rows[k], pick))
    for k in dropoff_order:
        seq += 1
        stop_rows.append((run_no, seq, "dropoff", rows[k], riders[k][2]))
    return {ci: rows[k] for k, (ci, *_r) in enumerate(riders)}


# Rosa: 5 riders picked up before her; she is drop-off #6 (Huma's example).
rosa_run = build_run(HL, 0, [
    (10, "13:20", "14:30", PLACES[2]), (11, "13:32", "14:41", PLACES[1]), (12, "13:44", "14:52", PLACES[3]),
    (13, "13:55", "15:02", PLACES[6]), (14, "14:05", "15:12", PLACES[5]), (0, "14:15", "15:25", PLACES[0]),
], dropoff_order=[0, 1, 2, 3, 4, 5], demo_trip_ids={0: "58213"})
# Ana: 3 riders before her; she is drop-off #2.
ana_run = build_run(HL, 1, [
    (15, "16:00", "17:00", PLACES[1]), (16, "16:15", "17:25", PLACES[0]), (17, "16:30", "17:38", PLACES[6]),
    (2, "16:45", "17:12", PLACES[5]),
], dropoff_order=[0, 3, 1, 2], demo_trip_ids={2: "58266"})
# Marcus: 1 rider before him; he is dropped off first.
marcus_run = build_run(SR, 0, [
    (18, "15:10", "16:05", PLACES[2]), (1, "15:30", "15:50", PLACES[1]),
], dropoff_order=[1, 0], demo_trip_ids={1: "58240"})
ROSA_TODAY, ANA_TODAY, MARCUS_TODAY = rosa_run[0], ana_run[2], marcus_run[1]

# Other riders' trips today that are not on a demo run.
for ci in range(3, 10):
    if random.random() < 0.5:
        add_trip(ci, random.randrange(len(VENDORS)), 0, random.choice(PICKUP_TIMES[5:]), random.choice(PLACES))

w(f"-- {len(trip_rows)} trips (rows are inserted in order, so trips.id = position below)")
w("insert into trips (trip_id, customer_id, vendor_id, vehicle_id, driver_id, scheduled_pickup, pickup_area,")
w("                   dropoff_name, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status,")
w("                   actual_arrival, actual_departure, driver_called, driver_assisted,")
w("                   reassigned_from_vendor_id) values")
vals = []
for (_, tid, cid, vid, van, drv, d, hhmm, cust, place, status, arr, dep, called, assisted, moved) in trip_rows:
    vals.append("  (" + ", ".join([
        q(tid), str(cid), str(vid), str(van), str(drv), ts(d, hhmm), q(cust[4]),
        q(place[0]), q(cust[6]), q(cust[7]), q(place[1]), q(place[2]), q(status),
        ts(d, hhmm, arr) if arr is not None else "null",
        ts(d, hhmm, dep) if dep is not None else "null",
        q(called), q(assisted), str(moved + 1) if moved is not None else "null"]) + ")")
w(",\n".join(vals) + ";")
w("")
w("insert into trip_events (trip_id, event_type, occurred_at, details) values")
w(",\n".join(f"  ({r}, {q(e)}, {t}, {q(dt)})" for r, e, t, dt in event_rows) + ";")
w("")
w("insert into complaints (complaint_number, customer_id, trip_id, vendor_id, category, description,")
w("                        filed_at, status, resolution) values")
w(",\n".join("  (" + ", ".join([q(n), str(c), str(t), str(v), q(cat), q(txt), f, q(s), q(r)]) + ")"
             for n, c, t, v, cat, txt, f, s, r in complaint_rows) + ";")
w("")

# Runs: every van works today (AM and PM); only demo runs have stop lists.
w("insert into runs (vehicle_id, driver_id, run_date, shift) values")
all_runs = []
demo_keys = {(v, sh) for v, _, sh in run_rows}
for vi in range(len(VENDORS)):
    for k in range(VANS_PER_VENDOR):
        all_runs.append((van_row(vi, k), driver_row(vi, k), "AM"))
        if (van_row(vi, k), "PM") not in demo_keys:
            all_runs.append((van_row(vi, k), driver_row(vi, pm_driver_slot(k)), "PM"))
# demo runs go first so run ids 1..3 match stop_rows
ordered = run_rows + all_runs
w(",\n".join(f"  ({v}, {d}, (now() at time zone 'America/New_York')::date, {q(sh)})" for v, d, sh in ordered) + ";")
w("")
w("insert into run_stops (run_id, seq, stop_type, trip_id, planned_time) values")
w(",\n".join(f"  ({r}, {sq}, {q(t)}, {tr}, {ts(0, hhmm)})" for r, sq, t, tr, hhmm in stop_rows) + ";")
w("")

# Van positions: today's demo vans start ~3 km from pickup.
w("insert into vehicle_positions (vehicle_id, trip_id, lat, lng, eta_minutes) values")
pos = []
for row in (ROSA_TODAY, MARCUS_TODAY, ANA_TODAY):
    t = trip_rows[row - 1]
    cust = t[8]
    pos.append(f"  ({t[4]}, {row}, {cust[6] + 0.018}, {cust[7] - 0.022}, 12)")
w(",\n".join(pos) + ";")
w("")

# ---------------------------------------------------------------- FAQ
FAQ = [
    ("pickup_window", "How long should I wait for my ride?",
     "Your pickup window is 30 minutes. It starts at your scheduled pickup time and ends 30 minutes later. "
     "Please be ready at the start of the window."),
    ("driver_wait", "How long will the driver wait for me?",
     "The driver must wait five minutes after your scheduled pickup time, even if they arrive early."),
    ("late_vehicle", "My ride is late. What can I do?",
     "I can check where your van is right now. If it is going to arrive more than 30 minutes after your "
     "scheduled pickup time, I can try to arrange other transportation for you."),
    ("door_assist", "Will the driver help me?",
     "Drivers assist riders in boarding and exiting the vehicle safely. I can ask the vendor to have the "
     "driver call you or come to the door."),
    ("trip_id", "What is a Trip ID?",
     "Each trip has its own Trip ID number. It helps me find that trip quickly when you call about it."),
    ("aar_id", "Why do you need my AAR ID?",
     "Your AAR ID and date of birth let me confirm I am speaking about the right account. "
     "I can't look up an account by name."),
    ("complaint", "How do I file a complaint?",
     "I can record a complaint on this call. I will need the date, the Trip ID if you have it, and what happened. "
     "I will give you a complaint number."),
    ("booking", "Can you book or change a trip?",
     "This demo line handles trip status, driver call-outs, and complaints. Booking and changes are not "
     "part of this simulation."),
    ("caregiver", "Can I call for my mother?",
     "Yes. I will need her AAR ID and date of birth, and I will note that you are calling on her behalf."),
]
w("insert into faq (topic, question, answer) values")
w(",\n".join(f"  ({q(a)}, {q(b)}, {q(c)})" for a, b, c in FAQ) + ";")
w("")
w("commit;")

OUT.write_text("\n".join(lines) + "\n")
print(f"Wrote {OUT}: {len(trip_rows)} trips, {len(event_rows)} events, {len(complaint_rows)} complaints")
