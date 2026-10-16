# Simulated AAR system (Ride Assure v2)

A pretend Access-A-Ride dispatch system for the Ride Assure demo. **Everything in it is made up:** riders, AAR IDs, vendors, drivers, trips, and complaints. It is not connected to or affiliated with the MTA.

## Set it up in Supabase

1. In your Supabase project, open **SQL Editor → New query**.
2. Paste all of `schema.sql` and click **Run**. Do this once.
3. Open a new query, paste all of `seed.sql`, and click **Run**. You can re-run this any time to reset the demo data.
4. **Optional, recommended:** paste all of `reset_demo.sql` and click **Run**. It refreshes the demo data with today's dates every night at 4 am New York time, so you never have to re-run the seed. (To refresh by hand any time: `select reset_demo();`)
5. Check **Table Editor**: you should see 20 customers, 4 vendors, 60 vans, 72 drivers, about 290 trips, and 120 runs.

## What's in it

| Table | What it holds |
| --- | --- |
| `vendors`, `drivers`, `vehicles` | 4 made-up vendors, each with 15 vans and 18 drivers (enough to cover morning and afternoon shifts) |
| `customers` | 10 main riders with history, plus 10 who only share today's demo vans. Each has an AAR ID, date of birth, intersection (not a home address), needs, emergency contact |
| `trips`, `trip_events` | ~90 days of history plus today's trips, each with a timeline (dispatched, arrived, departed...). Some trips show AAR moving the trip to a different vendor. |
| `runs`, `run_stops` | Every van's morning and afternoon run today. The three demo runs have full ordered stop lists (shared rides). |
| `complaints` | Complaints already on file, some open, some resolved, some with no response |
| `calls`, `vendor_contacts` | Filled in during the demo: each call to the rep, and each time the rep contacts a vendor |
| `faq` | The rep's standard answers |
| `vehicle_positions` | Where each demo van is right now, for the live map |

Vendors behave differently on purpose, so reports show a pattern. Harborlight Mobility is late about half the time. Bluebird Transit is rarely late.

## Privacy and security rules

- **No lookup by name.** `verify_caller(call_id, aar_id, date_of_birth)` is the only way to connect a caller to an account. It strips spaces and letters from the AAR ID ("RA 100-234" → `100234`), and both values must match.
- **Other passengers stay private.** `ride_progress(trip_id)` returns only counts and order (stops before your pickup, drop-offs before yours, your drop-off number), never other riders' names or locations.
- **3 tries per call.** After three wrong answers, the call is locked and stays unverified.
- **The browser can't read rider data.** Row-level security is on for every table. The browser (anon key) can only read `vehicle_positions` (for the map) and `faq`. The rep's server functions use the `service_role` key, which must never be put in front-end code.

## Changing the data

Edit `generate_seed.py`, then run `python3 supabase/generate_seed.py` to rewrite `seed.sql`. The output is the same every time. Dates are relative to "today in New York" when the seed runs, so the data never goes stale.
