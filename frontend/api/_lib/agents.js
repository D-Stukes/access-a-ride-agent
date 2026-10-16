// Two AI roles on one simulated phone call:
//   Ride Assure (the rider's assistant) calls on the rider's behalf.
//   The AAR rep (simulated customer service) verifies the caller, looks things up, and
//   contacts the vendor while Ride Assure holds.
// The browser drives the call one step at a time (one short request per step), so no
// single request runs long. The call's history travels with each request; anything that
// matters for security (is this call verified?) lives in the database, not the history.

import * as aar from "./aar.js";

export const MAX_STEPS = 20;

// ---------------------------------------------------------------- prompts
export function repSystemPrompt() {
  return `You are Marisol, a customer service representative for a SIMULATED Access-A-Ride (AAR) line in a demo app. Everything in this system is fake demo data.

How you work:
- Answer the phone with a short greeting.
- Before sharing ANY account or trip information, verify the caller with verify_caller, using the rider's AAR ID and date of birth. Ask for both if the caller hasn't given them. You cannot look anyone up by name.
- If verification fails, say so plainly and ask them to check the details. After 3 failed tries the call is locked; explain they can find their AAR ID on their AAR paperwork or the MYmta app.
- The caller may be an assistant app or a family member calling for the rider. That is allowed after verification; mention it in your call note.
- Use only facts from your tools. Never guess times, vendors, or numbers.
- Other passengers: share only counts and order (for example, "two stops before you"). Never their names or where they are going.
- If the caller asks for the driver to call, come to the door, or help with boarding, use contact_vendor. Before you call it, tell the caller you'll place them on a brief hold. After it returns, relay the vendor's answer.
- You may mention recent complaints on file if they relate to today's trip, briefly and factually. Never judge or name an individual driver.
- Before ending, save a one-sentence summary with add_call_note and give the caller the ticket number it returns.
- Speak like a real phone rep: short sentences, plain words, 1 to 3 sentences per turn, one topic at a time. No lists, no markdown, no emoji.
- Dates for verify_caller go in YYYY-MM-DD format.`;
}

export function agentSystemPrompt(rider) {
  return `You are Ride Assure, an assistant app that helps paratransit riders. You are on a phone call with Access-A-Ride (AAR) customer service, calling on behalf of your rider. This is a SIMULATED AAR line in a demo.

Your rider:
- Name: ${rider.firstName} ${rider.lastName}
- AAR ID: ${rider.aarId}
- Date of birth: ${rider.dobSpoken}
- Needs: ${rider.needs}
${rider.requestedBy ? `- This request came from ${rider.requestedBy}, who is helping the rider.\n` : ""}
The rider asked you: "${rider.request}"
The rider agreed that you may share their AAR ID and date of birth with AAR for this call.

How you work:
- Introduce yourself as Ride Assure, an assistant calling for your rider.
- Give the AAR ID and date of birth when the rep asks for them. Share nothing else private.
- Get what the rider needs: where the van is, about how long until pickup, and how many stops come before them. If their needs call for it, ask that the driver call on arrival and come to the door to help.
- Speak like a polite person on the phone: 1 or 2 short sentences per turn. No lists, no markdown, no emoji.
- Never make up facts. Only repeat what the rep tells you.
- When the rep has answered everything and given a ticket number, thank them, say goodbye, and call end_call with a summary for your rider.
- The summary is read aloud to an older rider: 2 to 4 short sentences, plain words, only facts the rep said (time, stops before pickup, whether the driver will come to the door, ticket number).`;
}

// ---------------------------------------------------------------- tools
export const REP_TOOLS = [
  { name: "verify_caller", description: "Verify the caller with the rider's AAR ID and date of birth. Required before any other account tool works.",
    input_schema: { type: "object", properties: { aar_id: { type: "string" }, date_of_birth: { type: "string", description: "YYYY-MM-DD" } }, required: ["aar_id", "date_of_birth"] } },
  { name: "get_todays_trip", description: "Today's booked trip for the verified rider: Trip ID, pickup window, destination, vendor, van.",
    input_schema: { type: "object", properties: {} } },
  { name: "get_ride_status", description: "Live status of today's trip: minutes until pickup, stops before pickup, passengers on board, drop-off order.",
    input_schema: { type: "object", properties: {} } },
  { name: "get_complaint_history", description: "Recent complaints on file for the verified rider.",
    input_schema: { type: "object", properties: {} } },
  { name: "contact_vendor", description: "Contact the vendor's dispatcher about today's trip (the caller is on hold during this). Use for driver call-out, door assistance, or a status check.",
    input_schema: { type: "object", properties: { request: { type: "string" } }, required: ["request"] } },
  { name: "lookup_faq", description: "AAR's standard answers (pickup window, driver wait, complaints, Trip ID, calling for someone).",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } },
  { name: "add_call_note", description: "Save a one-sentence summary of this call. Returns the ticket number to give the caller.",
    input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } },
];

export const AGENT_TOOLS = [
  { name: "end_call", description: "Hang up and give your rider a short spoken summary of the call.",
    input_schema: { type: "object", properties: { summary_for_rider: { type: "string" } }, required: ["summary_for_rider"] } },
];

const TOOL_NOTES = {
  verify_caller: "Checking the AAR ID and date of birth",
  get_todays_trip: "Looking up today's trip",
  get_ride_status: "Checking where the van is",
  get_complaint_history: "Looking at complaints on file",
  lookup_faq: "Checking AAR's standard answers",
  add_call_note: "Saving a note about this call",
};

async function runRepTool(db, callId, name, input) {
  switch (name) {
    case "verify_caller": return aar.verifyCaller(db, callId, input.aar_id, input.date_of_birth);
    case "get_todays_trip": return aar.getTodaysTrip(db, callId);
    case "get_ride_status": return aar.getRideStatus(db, callId);
    case "get_complaint_history": return aar.getComplaintHistory(db, callId);
    case "contact_vendor": return aar.contactVendor(db, callId, input.request);
    case "lookup_faq": return aar.lookupFaq(db, input.topic);
    case "add_call_note": return aar.addCallNote(db, callId, input.note);
    default: return { error: `Unknown tool ${name}` };
  }
}

// ---------------------------------------------------------------- the call
export async function startCallState(db, rider) {
  const call = await aar.startCall(db, { relation: rider.requestedBy ? `Ride Assure app, at the request of ${rider.requestedBy}` : "Ride Assure app, for the rider" });
  return {
    callId: call.id,
    ticket: call.ticket_number,
    state: {
      rider,
      next: "rep",
      steps: 0,
      done: false,
      repMsgs: [{ role: "user", content: "[The phone rings. A caller is on the line.]" }],
      agentMsgs: [],
      transcript: [],
    },
  };
}

// Add a user turn, merging into the previous one if it is also from the user
// (e.g. tool results followed by the other party's words).
function pushUser(msgs, content) {
  const last = msgs[msgs.length - 1];
  const blocks = (c) => (typeof c === "string" ? [{ type: "text", text: c }] : c);
  if (last && last.role === "user") last.content = [...blocks(last.content), ...blocks(content)];
  else msgs.push({ role: "user", content });
}

const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();

// One step: either the rep speaks (possibly after using tools), or Ride Assure speaks.
export async function step(db, llm, callId, state) {
  const events = [];
  if (state.done) return { events, state };
  state.steps += 1;

  if (state.steps > MAX_STEPS) {
    state.done = true;
    events.push({ type: "summary", text: "The call ran long, so I ended it. Please try again, or call AAR at 877-337-2017." });
    await aar.finishCall(db, callId, { outcome: "ended: too long", transcript: state.transcript });
    return { events, state };
  }

  if (state.next === "rep") {
    const lines = [];
    for (let i = 0; i < 6; i++) {
      const res = await llm({ role: "rep", system: repSystemPrompt(), tools: REP_TOOLS, messages: state.repMsgs });
      state.repMsgs.push({ role: "assistant", content: res.content });
      const said = textOf(res.content);
      const toolUses = res.content.filter((b) => b.type === "tool_use");
      if (said) {
        events.push({ type: "say", who: "rep", text: said });
        state.transcript.push({ who: "rep", text: said });
        lines.push(said);
      }
      if (!toolUses.length) break;
      const results = [];
      for (const tu of toolUses) {
        if (tu.name === "contact_vendor") {
          events.push({ type: "hold", seconds: aar.HOLD_SECONDS, text: "On hold while AAR contacts the vendor" });
        } else if (TOOL_NOTES[tu.name]) {
          events.push({ type: "note", text: TOOL_NOTES[tu.name] });
        }
        const out = await runRepTool(db, callId, tu.name, tu.input || {});
        if (tu.name === "verify_caller") {
          events.push({ type: "note", text: out.verified ? "Caller verified" : "Not verified. Nothing was shared" });
        }
        if (tu.name === "contact_vendor") events.push({ type: "hold_end" });
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      pushUser(state.repMsgs, results);
    }
    pushUser(state.agentMsgs, `AAR rep: ${lines.join(" ") || "(The line is quiet for a moment.)"}`);
    state.next = "agent";
    return { events, state };
  }

  // Ride Assure's turn
  const res = await llm({ role: "agent", system: agentSystemPrompt(state.rider), tools: AGENT_TOOLS, messages: state.agentMsgs });
  state.agentMsgs.push({ role: "assistant", content: res.content });
  const said = textOf(res.content);
  const end = res.content.find((b) => b.type === "tool_use" && b.name === "end_call");
  if (said) {
    events.push({ type: "say", who: "agent", text: said });
    state.transcript.push({ who: "agent", text: said });
  }
  if (end) {
    const summary = String(end.input?.summary_for_rider || "The call is finished.");
    state.agentMsgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: end.id, content: "Call ended." }] });
    events.push({ type: "summary", text: summary });
    state.done = true;
    const [call] = await db.select("calls", { eq: { id: callId } });
    events.push({ type: "done", ticket: call?.ticket_number, verified: !!call?.verified });
    await aar.finishCall(db, callId, { outcome: "completed", transcript: state.transcript, summary: call?.summary || summary });
    return { events, state };
  }
  pushUser(state.repMsgs, said || "(The caller is silent.)");
  state.next = "rep";
  return { events, state };
}

// ---------------------------------------------------------------- the model
export function anthropicLlm() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error("The server is missing ANTHROPIC_API_KEY. Add it in Vercel (Settings → Environment Variables) or in your local .env file.");
    e.setup = true;
    throw e;
  }
  const model = process.env.CALL_MODEL || "claude-sonnet-5-5";
  let client;
  return async ({ system, tools, messages }) => {
    if (!client) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      client = new Anthropic();
    }
    const res = await client.messages.create({ model, max_tokens: 400, system, tools, messages });
    return { content: res.content.map((b) => (b.type === "text" ? { type: "text", text: b.text } : b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input } : null)).filter(Boolean) };
  };
}
