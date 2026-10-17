// Two AI roles on one simulated phone call:
//   Ride Assure (the rider's assistant) calls on the rider's behalf.
//   The AAR rep (simulated customer service) verifies the caller, looks things up, and
//   contacts the vendor while Ride Assure holds.
// The browser drives the call one step at a time (one short request per step), so no
// single request runs long. The call's history travels with each request; anything that
// matters for security (is this call verified?) lives in the database, not the history.

import * as aar from "./aar.js";

export const MAX_STEPS = 20;
// Keep calls short: Ride Assure gets at most this many turns, and the last one must hang up.
export const MAX_AGENT_TURNS = 2;   // intro turn, then the closing turn that must hang up

// ---------------------------------------------------------------- prompts
export function repSystemPrompt() {
  return `You are Marisol, a customer service representative for a SIMULATED Access-A-Ride (AAR) line in a demo app. Everything in this system is fake demo data.

How you work:
- Answer the phone with a short greeting. That is your only line until your closing turn.
- Before sharing ANY account or trip information, verify the caller with verify_caller, using the rider's AAR ID and date of birth. Ask for both if the caller hasn't given them. You cannot look anyone up by name.
- If verification fails, say so plainly and ask them to check the details. After 3 failed tries the call is locked; explain they can find their AAR ID on their AAR paperwork or the MYmta app.
- The caller may be an assistant app or a family member calling for the rider. That is allowed after verification; mention it in your call note.
- Use only facts from your tools. Never guess times, vendors, or numbers.
- Other passengers: share only counts and order (for example, "two stops before you"). Never their names or where they are going.
- Once the caller is verified and has said what they need, work silently: call get_ride_status, then contact_vendor if they asked for a driver call or door help, then add_call_note, one after another, with no spoken line between any of them. The hold screen appears on its own when you contact the vendor; you don't need to announce it.
- Never mention complaints, a vendor's record, or how reliable a vendor or driver is. The rider only wants to know about their own ride. Do not call get_complaint_history unless the caller specifically asks about their complaints. Never judge or name an individual driver.
- Keep the whole call to two spoken turns: your opening greeting, and one closing turn that gives everything at once (time to pickup, stops before them, the vendor's answer, and the ticket number from add_call_note). Say nothing out loud in between.
- Speak like a real phone rep: short sentences, plain words, no more than 4 sentences per turn. No lists, no markdown, no emoji.
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
- Keep the call short: at most ${MAX_AGENT_TURNS} turns from you, including goodbye.
- In your first turn, say everything at once: introduce yourself as Ride Assure calling for your rider, give the AAR ID and date of birth, and ask for what the rider needs (where the van is, about how long until pickup, how many stops come before them, and, if their needs call for it, that the driver call on arrival and come to the door to help). Share nothing else private.
- Speak like a polite person on the phone: short sentences, no more than 3 per turn. No lists, no markdown, no emoji.
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
    // No "failed call" ending in this demo: the page quietly redials instead.
    await aar.finishCall(db, callId, { outcome: "redial", transcript: state.transcript });
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

  // Ride Assure's turn (the last allowed turn must hang up)
  state.agentTurns = (state.agentTurns || 0) + 1;
  const lastTurn = state.agentTurns >= MAX_AGENT_TURNS;
  const firstTurn = state.agentTurns === 1;
  const system = agentSystemPrompt(state.rider) + (lastTurn ? "\n\nThis is your last turn. Thank the rep, say goodbye, and call end_call now with a summary of what the rep said." : "");
  // This model rejects a forced tool_choice, so on the last turn the only tool offered is end_call.
  const agentTools = lastTurn ? AGENT_TOOLS.filter((t) => t.name === "end_call") : AGENT_TOOLS;
  const res = await llm({ role: "agent", system, tools: agentTools, messages: state.agentMsgs });
  state.agentMsgs.push({ role: "assistant", content: res.content });
  let end = res.content.find((b) => b.type === "tool_use" && b.name === "end_call");
  const spoken = textOf(res.content);
  // Safety net: if the model only talked on its last turn, hang up with what it said.
  if (!end && lastTurn) end = { id: "synthetic-end", name: "end_call", input: { summary_for_rider: spoken || "The call is finished." } };
  const said = spoken || (end ? "Thank you so much. Goodbye." : "");
  if (said) {
    // Privacy: this first turn states the rider's AAR ID and date of birth so the simulated
    // rep can verify the caller. That is text the two AI roles exchange, not something to
    // say out loud or show in the open. The rider-facing UI gets a safe stand-in line instead;
    // the real text above still goes to the rep so verification keeps working.
    const privacySpeak = firstTurn
      ? `${state.rider.firstName}, please hold while I give the Access-A-Ride agent your information.`
      : undefined;
    events.push({ type: "say", who: "agent", text: said, ...(privacySpeak ? { speak: privacySpeak } : {}) });
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
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    const where = process.env.VERCEL_ENV ? ` in Vercel's ${process.env.VERCEL_ENV} environment` : "";
    const e = new Error(`The server can't see ANTHROPIC_API_KEY${where} (missing or empty). Check the exact name, that it has a value, and that Preview is ticked, then redeploy.`);
    e.setup = true;
    throw e;
  }
  const model = process.env.CALL_MODEL || "claude-sonnet-5-5";
  let client;
  return async ({ system, tools, messages, toolChoice }) => {
    if (!client) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      client = new Anthropic({ apiKey, maxRetries: 4, timeout: 25000 });   // ride out brief overloads so a call does not drop
    }
    const res = await client.messages.create({ model, max_tokens: 400, system, tools, messages });
    return { content: res.content.map((b) => (b.type === "text" ? { type: "text", text: b.text } : b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input } : null)).filter(Boolean) };
  };
}
