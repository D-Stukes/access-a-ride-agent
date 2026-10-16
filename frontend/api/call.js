// POST /api/call — runs the simulated AAR call one step at a time.
//   { action: "start", rider, passcode? }                 -> { callId, ticket, state, trip }
//   { action: "step",  callId, ticket, state, passcode? } -> { events, state }
// Secrets (Anthropic key, Supabase secret key) are read from the server's environment and
// never sent to the browser.

import { getDb, SetupError } from "./_lib/db.js";
import { startCallState, step, anthropicLlm } from "./_lib/agents.js";
import { alignDemoRun, nyTime, loadCall } from "./_lib/aar.js";
import { mockLlm } from "./_lib/mock-llm.js";

export const config = { maxDuration: 60 };

const clean = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function riderFrom(body) {
  const r = body.rider || {};
  const dob = clean(r.dob, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new Error("Rider date of birth must be YYYY-MM-DD.");
  return {
    aarId: clean(r.aarId, 20),
    dob,
    dobSpoken: new Date(dob + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
    firstName: clean(r.firstName, 40),
    lastName: clean(r.lastName, 40),
    needs: clean(r.needs, 160),
    request: clean(r.request, 400) || "Where is my ride?",
    requestedBy: clean(r.requestedBy, 80) || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  if (process.env.DEMO_PASSCODE && body.passcode !== process.env.DEMO_PASSCODE) {
    return res.status(401).json({ error: "passcode", message: "This demo needs a passcode." });
  }

  try {
    const db = getDb();
    if (body.action === "start") {
      const rider = riderFrom(body);
      const started = await startCallState(db, rider);
      // Demo clock: put this rider's van about 15 minutes away, right now.
      const [cust] = await db.select("customers", { eq: { aar_id: rider.aarId } });
      const trip = cust ? await alignDemoRun(db, cust.id) : null;
      return res.status(200).json({
        ...started,
        trip: trip ? { tripId: trip.trip_id, pickup: nyTime(trip.scheduled_pickup) } : null,
      });
    }
    if (body.action === "step") {
      // MOCK_LLM=1 swaps Claude for a scripted stand-in (testing only).
      const llm = process.env.MOCK_LLM === "1" ? mockLlm() : anthropicLlm();
      await loadCall(db, Number(body.callId), String(body.ticket || "")); // the ticket must match this call
      const out = await step(db, llm, Number(body.callId), body.state);
      return res.status(200).json(out);
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    const setup = err instanceof SetupError || err.setup;
    console.error("[call]", err);
    return res.status(setup ? 500 : 502).json({
      error: setup ? "setup" : "call_failed",
      message: setup ? err.message : "The call dropped. Please try again.",
    });
  }
}
