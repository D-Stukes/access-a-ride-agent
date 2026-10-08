# Access-A-Ride Trip Accountability Agent

A single-role AI agent that records what happened on each Access-A-Ride (AAR) pickup, checks it against AAR's published rules, and shows which vendors fail riders most.

> **Status:** Design phase (Cycle 2, Week 3). The agent is not built yet. Sections marked *Planned* will be completed during the Week 4 build (Oct 12 to 15, 2026).

**PRD:** [Agent PRD (Google Doc)](https://docs.google.com/document/d/1oapLiHvhEjueSBD87G24wkAEBEay7Jz8DtVj3QBFvw0/edit?usp=sharing) · local copy: [PRD.md](PRD.md)

## The problem

AAR riders, many of them elderly or disabled, lose trips when contracted drivers:

- arrive late,
- do not call out or come to the door to assist, or
- leave before the rider can reach the van.

These failures are rarely recorded, so riders and caregivers have no evidence and no way to see patterns by vendor.

## The role

The agent plays one role: a **trip accountability assistant**.

| User | What the agent does for them |
| --- | --- |
| Care coordinator at a senior center or home-care agency (primary) | Logs trips across many riders and reports failures by vendor |
| Family caregiver or rider | Records a bad pickup and drafts a complaint to review and send |

## What the agent does

1. **Observe.** The user describes a trip in plain words. The agent asks for any missing details: rider, date, scheduled pickup time, arrival time, departure time, vendor name, and whether the driver called or came to the door.
2. **Decide.** The agent compares the trip to AAR's published rules and labels each failure: late, no assist, or left early.
3. **Act.** The agent shows the full record and saves it only after the user confirms.
4. **Report.** On request, the agent summarizes failures by vendor, rider, and date range.
5. **Draft.** On request, the agent drafts a complaint. The user reviews and sends it.

AAR rules the agent checks against ([source](https://www.mta.info/accessibility/access-a-ride/on-the-day-of-your-trip)):

| Rule | Standard |
| --- | --- |
| Pickup window | Riders wait up to 30 minutes after the scheduled pickup time |
| Driver wait | Driver must wait 5 minutes after the scheduled pickup time |
| Assistance | Drivers assist riders in boarding and exiting the vehicle |

## The one tool

A **trip log** in a Supabase database, used through two functions:

| Function | Access |
| --- | --- |
| `log_trip` | Insert only; saves one confirmed trip |
| `query_trips` | Read only; returns the signed-in user's trips |

The agent cannot edit or delete records. Each user sees only their own riders' trips.

## Planned Week 4 capability: voice and read-aloud

Many riders are blind, have low vision, or have limited mobility, so the Week 4 new capability adds:

- **Read-aloud:** the agent's replies can be spoken.
- **Voice input:** users can describe a trip by speaking.

Because speech recognition can mishear times, the agent reads every record back aloud and saves it only after the user says "yes."

## Future improvements

See the PRD for details.

- **Risk-based auto-approval:** code saves low-risk trips automatically; anything with a failure label still needs the user's "yes."
- **Comparing with AAR's reported times:** flag mismatches between what the rider saw and what AAR or the driver reported.
- **Benchmark-based vendor flags:** flag a vendor for review when its late rate is at least double the citywide rate (about 5%), across at least 10 confirmed trips.

## Out of scope

The agent will **not**:

- book, cancel, or change AAR trips (it points to AAR at 877-337-2017),
- track a van's live location or arrival time,
- send complaints for the user (it only drafts them),
- give legal or medical advice,
- rate or judge individual drivers,
- edit or delete saved records, or
- hand work to other agents.

## How to run it

*Planned for Week 4.* This section will list:

- requirements (language, Anthropic API key, Supabase project),
- setup steps and environment variables,
- the command to start the agent, and
- an example conversation.

## Evaluation

*Planned for Week 4.* Self-eval scores on the four Cycle 2 dimensions:

| Dimension | Target | Score |
| --- | --- | --- |
| Correctness | 18 of 20 sample trips labeled correctly | Planned |
| Tool-use reliability | 20 of 20 confirmed trips saved once | Planned |
| Edge-case handling | Asks or fails visibly; never guesses | Planned |
| Refusal behavior | Declines and redirects every out-of-scope request | Planned |

## Project files

| File | What it is |
| --- | --- |
| `README.md` | This file |
| `PRD.md` | Local copy of the PRD (the Google Doc is the official version) |
| `PRD.docx` | Word copy of the PRD |
| `system-prompt.md` | The agent's system prompt and design notes |
| `injection-tests.md` | Prompt-injection scenarios and pressure-test results |
| `pitch-script.md` | Week 3 pitch script and Q&A preparation |
| `architecture-diagram.png` / `.svg` | Digital architecture diagram (the official one is drawn on paper) |

## Team

Built by Diane Stukes and Huma Ali for Pursuit 2026 AI Builders, Cycle 2.
