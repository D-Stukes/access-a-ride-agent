// The SIMULATED Access-A-Ride system: what the AAR rep's tools can look up and do.
// All data is fake. Every lookup about a rider requires a verified call: the call row in
// the database must say verified = true, which only verify_caller() can set.

const NY = "America/New_York";
export const HOLD_SECONDS = 6;
const DEMO_MINUTES_UNTIL_PICKUP = 15;

export function nyTime(d) {
  return new Date(d).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" });
}

const minutesFromNow = (d) => Math.round((new Date(d).getTime() - Date.now()) / 60000);

// ---------------------------------------------------------------- calls
export async function startCall(db, { relation }) {
  return db.insert("calls", { caller_relation: relation });
}

export async function loadCall(db, callId, ticket) {
  const [call] = await db.select("calls", { eq: { id: callId } });
  if (!call || call.ticket_number !== ticket) throw new Error("Unknown call.");
  return call;
}

export async function finishCall(db, callId, { summary, outcome, transcript, tripId }) {
  await db.update("calls", { id: callId }, {
    ended_at: new Date().toISOString(),
    summary: summary ?? null,
    outcome: outcome ?? null,
    transcript: transcript ?? [],
    ...(tripId ? { trip_id: tripId } : {}),
  });
}

// ---------------------------------------------------------------- verification
// Accepts "1948-03-14", "March 14, 1948", "3/14/1948". Returns "YYYY-MM-DD" or null.
export function parseDob(text) {
  const s = String(text || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso(m[3], m[1], m[2]);
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  m = s.toLowerCase().replace(/,/g, " ").match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
  if (m) {
    const mi = months.findIndex((x) => x.startsWith(m[1].slice(0, 3)));
    if (mi >= 0) return iso(m[3], mi + 1, m[2]);
  }
  return null;
}
const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export async function verifyCaller(db, callId, aarId, dobText) {
  const dob = parseDob(dobText);
  if (!dob) return { verified: false, message: "I couldn't read that date of birth. Please give month, day, and year." };
  const [row] = await db.rpc("verify_caller", { p_call_id: callId, p_aar_id: String(aarId || ""), p_dob: dob });
  if (row?.verified) return { verified: true, first_name: row.first_name };
  return {
    verified: false,
    attempts_left: row?.attempts_left ?? 0,
    message: (row?.attempts_left ?? 0) > 0
      ? "Those details don't match our records. Nothing about the account was shared."
      : "Too many tries. This call is locked and the account stays private.",
  };
}

async function verifiedCustomer(db, callId) {
  const [call] = await db.select("calls", { eq: { id: callId } });
  if (!call?.verified || !call.customer_id) return null;
  return call.customer_id;
}
const NOT_VERIFIED = { error: "not_verified", message: "Verify the caller first with their AAR ID and date of birth." };

// ---------------------------------------------------------------- today's trip
async function todaysTrip(db, customerId) {
  const trips = await db.select("trips", { eq: { customer_id: customerId }, order: { column: "scheduled_pickup", ascending: false }, limit: 40 });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: NY });
  const todays = trips.filter((t) => new Date(t.scheduled_pickup).toLocaleDateString("en-CA", { timeZone: NY }) === today);
  if (!todays.length) return null;
  const onRun = await db.select("run_stops", { in: { trip_id: todays.map((t) => t.id) } });
  const runTripIds = new Set(onRun.map((s) => s.trip_id));
  return todays.find((t) => runTripIds.has(t.id)) || todays[0];
}

// Demo clock: move this rider's shared-ride run so their pickup is about 15 minutes from
// now. Stops whose new time has already passed are marked done, so the van is "on its way".
export async function alignDemoRun(db, customerId) {
  const trip = await todaysTrip(db, customerId);
  if (!trip) return null;
  const [myPick] = await db.select("run_stops", { eq: { trip_id: trip.id, stop_type: "pickup" } });
  if (!myPick) return trip;
  const stops = await db.select("run_stops", { eq: { run_id: myPick.run_id }, order: { column: "seq" } });
  const target = Date.now() + DEMO_MINUTES_UNTIL_PICKUP * 60000;
  const delta = target - new Date(myPick.planned_time).getTime();
  const now = Date.now();
  const tripShift = new Map();
  for (const s of stops) {
    const t = new Date(new Date(s.planned_time).getTime() + delta);
    await db.update("run_stops", { id: s.id }, {
      planned_time: t.toISOString(),
      completed_at: t.getTime() < now ? t.toISOString() : null,
    });
    if (s.stop_type === "pickup") tripShift.set(s.trip_id, t);
  }
  for (const [tripId, pickupTime] of tripShift) {
    await db.update("trips", { id: tripId }, {
      scheduled_pickup: pickupTime.toISOString(),
      status: pickupTime.getTime() < now ? "picked_up" : (tripId === trip.id ? "en_route" : "scheduled"),
    });
  }
  const [run] = await db.select("runs", { eq: { id: myPick.run_id } });
  if (run) {
    await db.update("vehicle_positions", { vehicle_id: run.vehicle_id }, {
      eta_minutes: DEMO_MINUTES_UNTIL_PICKUP, trip_id: trip.id, updated_at: new Date().toISOString(),
    });
  }
  return { ...trip, scheduled_pickup: new Date(target).toISOString() };
}

// ---------------------------------------------------------------- rep tools
async function tripDetails(db, customerId) {
  const trip = await todaysTrip(db, customerId);
  if (!trip) return null;
  const [vendor] = await db.select("vendors", { eq: { id: trip.vendor_id } });
  const [van] = trip.vehicle_id ? await db.select("vehicles", { eq: { id: trip.vehicle_id } }) : [];
  return { trip, vendor, van };
}

export async function getTodaysTrip(db, callId) {
  const customerId = await verifiedCustomer(db, callId);
  if (!customerId) return NOT_VERIFIED;
  const d = await tripDetails(db, customerId);
  if (!d) return { trip: null, message: "No trip is booked for this rider today." };
  const pickup = new Date(d.trip.scheduled_pickup);
  return {
    trip_id: d.trip.trip_id,
    pickup_window: `${nyTime(pickup)} to ${nyTime(pickup.getTime() + 30 * 60000)}`,
    pickup_area: d.trip.pickup_area,
    going_to: d.trip.dropoff_name,
    vendor: d.vendor?.name,
    van: d.van?.van_number,
    status: d.trip.status,
  };
}

export async function getRideStatus(db, callId) {
  const customerId = await verifiedCustomer(db, callId);
  if (!customerId) return NOT_VERIFIED;
  const d = await tripDetails(db, customerId);
  if (!d) return { message: "No trip is booked for this rider today." };
  const [p] = await db.rpc("ride_progress", { p_trip_id: d.trip.id });
  if (!p || p.phase === "not_on_a_run") {
    return { trip_id: d.trip.trip_id, vendor: d.vendor?.name, van: d.van?.van_number,
             message: "This trip is not on a shared run. Live position isn't available." };
  }
  return {
    trip_id: d.trip.trip_id,
    vendor: d.vendor?.name,
    van: d.van?.van_number,
    phase: p.phase,
    eta_minutes: Math.max(0, minutesFromNow(p.eta_pickup)),
    expected_pickup: nyTime(p.eta_pickup),
    stops_before_pickup: p.stops_before_pickup,
    passengers_on_board_now: p.passengers_on_board,
    dropoffs_before_rider: p.dropoffs_before_mine,
    rider_dropoff_number: p.my_dropoff_number,
    expected_dropoff: nyTime(p.eta_dropoff),
    privacy_note: "Share other passengers only as counts. Never their names or stops.",
  };
}

export async function getComplaintHistory(db, callId) {
  const customerId = await verifiedCustomer(db, callId);
  if (!customerId) return NOT_VERIFIED;
  const rows = await db.select("complaints", { eq: { customer_id: customerId }, order: { column: "filed_at", ascending: false }, limit: 6 });
  const vendors = Object.fromEntries((await db.select("vendors")).map((v) => [v.id, v.name]));
  return {
    complaints: rows.map((c) => ({
      number: c.complaint_number,
      filed: new Date(c.filed_at).toLocaleDateString("en-US", { timeZone: NY, month: "short", day: "numeric" }),
      vendor: vendors[c.vendor_id],
      category: c.category,
      status: c.status,
    })),
  };
}

export async function contactVendor(db, callId, request) {
  const customerId = await verifiedCustomer(db, callId);
  if (!customerId) return NOT_VERIFIED;
  const d = await tripDetails(db, customerId);
  if (!d) return { message: "No trip today, so there is no vendor to contact." };
  const [p] = await db.rpc("ride_progress", { p_trip_id: d.trip.id });
  const eta = p && p.phase !== "not_on_a_run" ? Math.max(0, minutesFromNow(p.eta_pickup)) : null;
  const stops = p?.stops_before_pickup;
  const wantsDoor = /door|assist|help|call|knock/i.test(request || "");
  // The simulated vendor dispatcher's answer, built only from the system's own data.
  const response = [
    `${d.vendor.name} dispatch here. Van ${d.van?.van_number ?? "assigned"} is`,
    eta !== null ? ` about ${eta} minutes away` : " on its way",
    stops ? `, with ${stops} ${stops === 1 ? "stop" : "stops"} before this pickup.` : ".",
    wantsDoor ? " We've told the driver to call the rider on arrival and come to the door to help with boarding." : "",
  ].join("");
  await db.insert("vendor_contacts", {
    call_id: callId, vendor_id: d.vendor.id, trip_id: d.trip.id,
    request: String(request || "status check").slice(0, 300),
    response, responded_at: new Date(Date.now() + HOLD_SECONDS * 1000).toISOString(),
  });
  await db.insert("trip_events", {
    trip_id: d.trip.id, event_type: "vendor_contacted",
    occurred_at: new Date().toISOString(), details: `AAR rep contacted ${d.vendor.name}: ${String(request || "").slice(0, 120)}`,
  });
  return { vendor: d.vendor.name, hold_seconds: HOLD_SECONDS, vendor_response: response };
}

export async function lookupFaq(db, topic) {
  const rows = await db.select("faq");
  const t = String(topic || "").toLowerCase();
  const hit = rows.find((r) => r.topic === t) ||
              rows.find((r) => (r.topic + " " + r.question).toLowerCase().includes(t.split(/\s+/)[0] || "~"));
  return hit ? { question: hit.question, answer: hit.answer } : { topics: rows.map((r) => r.topic) };
}

export async function addCallNote(db, callId, note) {
  await db.update("calls", { id: callId }, { summary: String(note || "").slice(0, 1000) });
  const [call] = await db.select("calls", { eq: { id: callId } });
  return { saved: true, ticket_number: call.ticket_number };
}
