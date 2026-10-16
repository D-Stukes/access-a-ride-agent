// End-to-end test of the simulated call against a plain Postgres copy of the database,
// with the scripted stand-in for Claude. Usage:
//   DATABASE_URL=postgres://... MOCK_LLM=1 node test/run-call.mjs
import handler from "../api/call.js";
import * as aar from "../api/_lib/aar.js";
import { getDb } from "../api/_lib/db.js";

process.env.MOCK_LLM = "1";
const call = (body) => new Promise((resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ code: this.statusCode, body: o }); } };
  handler({ method: "POST", body }, res);
});
let failures = 0;
const check = (label, ok, detail = "") => { console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ": " + detail : ""}`); if (!ok) failures++; };

const ROSA = { aarId: "100234", dob: "1948-03-14", firstName: "Rosa", lastName: "Tavares", needs: "Wheelchair; needs door-to-door help", request: "Where's my ride? Can the driver come to my door?" };

console.log("\n=== 1. Full call for Rosa (scripted model, real tools + database)");
const start = await call({ action: "start", rider: ROSA });
check("call starts", start.code === 200 && start.body.callId, JSON.stringify(start.body.trip));
let { callId, ticket, state } = start.body;
const events = [];
while (!state.done) {
  const r = await call({ action: "step", callId, ticket, state });
  if (r.code !== 200) { check("step ok", false, JSON.stringify(r.body)); break; }
  events.push(...r.body.events); state = r.body.state;
}
for (const e of events) console.log(`    ${e.type.padEnd(8)} ${e.who ? e.who.padEnd(6) : "      "} ${e.text ?? e.ticket ?? (e.seconds ? e.seconds + "s" : "")}`);
const db = getDb();
const [row] = await db.select("calls", { eq: { id: callId } });
const vc = await db.select("vendor_contacts", { eq: { call_id: callId } });
check("caller verified in the database", row.verified === true && row.customer_id === 1);
check("vendor contacted once, with a hold", vc.length === 1 && events.some((e) => e.type === "hold"), vc[0]?.response);
check("rep gave stops before pickup", events.some((e) => e.who === "rep" && /1 stop before/.test(e.text)));
check("summary for the rider", events.some((e) => e.type === "summary"));
check("call saved with transcript + outcome", row.outcome === "completed" && row.transcript.length >= 6 && !!row.ended_at);
check("steps used", state.steps <= 20, String(state.steps));

console.log("\n=== 2. Tools are locked until the caller is verified");
const s2 = await call({ action: "start", rider: ROSA });
const cid = s2.body.callId;
const before = await aar.getRideStatus(db, cid);
check("ride status before verifying", before.error === "not_verified");
check("complaints before verifying", (await aar.getComplaintHistory(db, cid)).error === "not_verified");
check("vendor contact before verifying", (await aar.contactVendor(db, cid, "come to door")).error === "not_verified");
const wrong = await aar.verifyCaller(db, cid, "100234", "1948-03-15");
check("wrong date of birth is refused", wrong.verified === false && wrong.attempts_left === 2, wrong.message);
check("still locked after a wrong answer", (await aar.getRideStatus(db, cid)).error === "not_verified");
check("spoken DOB format accepted", (await aar.verifyCaller(db, cid, "RA 100-234", "March 14, 1948")).verified === true);

console.log("\n=== 3. Someone else's call can't be driven with a wrong ticket");
const bad = await call({ action: "step", callId: cid, ticket: "T-00000", state: s2.body.state });
check("wrong ticket rejected", bad.code !== 200);

console.log(`\n${failures ? failures + " FAILED" : "All checks passed"}`);
await db.close?.();
process.exit(failures ? 1 : 0);
