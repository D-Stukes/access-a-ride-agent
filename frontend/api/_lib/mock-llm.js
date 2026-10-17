// A scripted stand-in for Claude, used only for testing (MOCK_LLM=1 or the test script).
// It plays both roles in a fixed, sensible order and uses the REAL tools and database, so
// it proves the plumbing: verification gate, lookups, vendor hold, call notes, summary.
// It does not show how Claude itself behaves.

let n = 0;
const id = () => `toolu_mock_${++n}`;
const txt = (t) => ({ type: "text", text: t });
const tool = (name, input) => ({ type: "tool_use", id: id(), name, input });

function flatten(messages) {
  const out = [];
  for (const m of messages) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    for (const b of blocks) out.push({ role: m.role, ...b });
  }
  return out;
}

function lastResult(flat, toolName) {
  const uses = flat.filter((b) => b.type === "tool_use" && b.name === toolName);
  if (!uses.length) return null;
  const r = flat.find((b) => b.type === "tool_result" && b.tool_use_id === uses[uses.length - 1].id);
  return r ? JSON.parse(r.content) : null;
}

function repTurn(messages) {
  const flat = flatten(messages);
  const userText = flat.filter((b) => b.role === "user" && b.type === "text").map((b) => b.text).join(" ");
  const lastUser = [...flat].reverse().find((b) => b.role === "user");
  const called = (name) => flat.some((b) => b.type === "tool_use" && b.name === name);

  if (!flat.some((b) => b.role === "assistant")) return [txt("Access-A-Ride customer service, this is Marisol. How can I help you today?")];

  if (!called("verify_caller")) {
    const aar = userText.match(/\b(\d{6})\b/);
    const dob = userText.match(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/);
    if (!aar || !dob) return [txt("I can help with that. May I have the rider's AAR ID and date of birth?")];
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [mName, d, y] = dob[0].replace(",", "").split(" ");
    const iso = `${y}-${String(months.indexOf(mName) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
    return [tool("verify_caller", { aar_id: aar[1], date_of_birth: iso })];
  }
  const v = lastResult(flat, "verify_caller");
  if (v && !v.verified) return [txt("I'm sorry, those details don't match our records. Could you check the AAR ID and date of birth?")];

  // Once verified, do everything in this one turn: status, vendor (if asked), note, then one answer.
  if (!called("get_ride_status")) return [txt(`Thank you, ${v?.first_name ?? "the rider"}'s account is verified. One moment while I check the van.`), tool("get_ride_status", {})];
  if (!called("contact_vendor") && /door|call/i.test(userText)) return [txt("I'll place you on a brief hold while I contact the vendor."), tool("contact_vendor", { request: "Driver to call on arrival and come to the door to help with boarding." })];
  if (!called("add_call_note")) return [tool("add_call_note", { note: "Ride Assure called for the rider; gave ETA and stops; vendor asked to call and come to the door." })];
  const s = lastResult(flat, "get_ride_status") || {};
  const r = lastResult(flat, "contact_vendor");
  const vendor = r ? ` The vendor says: ${String(r.vendor_response || "they have the request.").replace(/^.*?dispatch here\. /, "")}` : "";
  const note = lastResult(flat, "add_call_note");
  return [txt(`Thank you for holding. The ${s.vendor} van is about ${s.eta_minutes} minutes away, with ${s.stops_before_pickup} ${s.stops_before_pickup === 1 ? "stop" : "stops"} before the pickup.${vendor} Your ticket number is ${note?.ticket_number}.`)];
}

function agentTurn(messages, system, forceEnd) {
  const said = messages.filter((m) => m.role === "assistant").length;
  const name = system.match(/Name: (.+)/)?.[1] ?? "my rider";
  const aar = system.match(/AAR ID: (\d+)/)?.[1];
  const dob = system.match(/Date of birth: (.+)/)?.[1];
  const last = messages[messages.length - 1];
  const lastText = typeof last.content === "string" ? last.content : last.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  const ticket = lastText.match(/ticket number is ([A-Z]-\d+)/)?.[1];
  if (ticket || forceEnd) {
    return [txt("Thank you so much. Goodbye."), tool("end_call", { summary_for_rider: `Your van is on the way. The driver will call when they arrive and come to your door to help you.${ticket ? ` Your ticket number is ${ticket}.` : ""}` })];
  }
  if (said === 0) return [txt(`Hello, this is Ride Assure, an assistant calling for my rider, ${name}. Her AAR ID is ${aar} and her date of birth is ${dob}. Where is her van, and how many stops are before her? She uses a wheelchair, so could the driver call when they arrive and come to the door?`)];
  return [txt("Could you give me the ticket number for this call, please?")];
}

export function mockLlm() {
  return async ({ role, system, messages, tools }) => ({ content: role === "rep" ? repTurn(messages) : agentTurn(messages, system, (tools || []).length === 1) });
}
