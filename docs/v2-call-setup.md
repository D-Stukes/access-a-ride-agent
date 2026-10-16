# Ride Assure v2: the call demo

**Page:** `frontend/call.html`. The rider asks Ride Assure about their ride. Ride Assure asks permission to share the rider's AAR ID and date of birth, then calls a **simulated** AAR rep. The rep verifies the caller, checks the van and the stop order, puts Ride Assure on a brief hold while it contacts the vendor, and gives a ticket number. Ride Assure then reads a short summary to the rider. Both voices are spoken aloud and shown as text. There are no interruptions during the call.

## How it's built

| Part | File | What it does |
| --- | --- | --- |
| Page | `frontend/call.html` | Rider picker, the rider's Ride Assure chat, the consent step, the live call panel, hold music, and the summary |
| Endpoint | `frontend/api/call.js` | `POST /api/call`: `start` begins a call, and each `step` runs one turn |
| AI roles | `frontend/api/_lib/agents.js` | Prompts and tools for Ride Assure and for Marisol, the AAR rep |
| Simulated AAR system | `frontend/api/_lib/aar.js` | The rep's tools: verify caller, today's trip, ride status, complaints, contact vendor, FAQ, call note |
| Data layer | `frontend/api/_lib/db.js` | Supabase for the real demo, or plain Postgres for tests |
| Test | `frontend/test/run-call.mjs` | A full call plus security checks, using a scripted stand-in for Claude |

**Security:** the Anthropic key and the Supabase secret key stay on the server. Every lookup about a rider checks the database to confirm the call was verified with AAR ID plus date of birth. A call can only be continued with its own ticket number. Other passengers appear only as counts.

**Demo clock:** when a call starts, the rider's shared-ride van is moved so pickup is about 15 minutes from now, with the earlier stops already done. The nightly reset puts everything back.

## Run it on Vercel (preview link)

1. **Check the root folder.** In Vercel, open the project, then **Settings → Build and Deployment → Root Directory**. It should say `frontend`. The project name `access-a-ride-agent-frontend` suggests it already does.
2. **Add three environment variables** in **Settings → Environment Variables**, ticking **Preview** (and **Production** later, if you want it live there):
   - `ANTHROPIC_API_KEY`: your Anthropic API key
   - `SUPABASE_URL`: from Supabase, **Project Settings → API Keys** (or the project's home page)
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase **secret** key from the same page
   - Optional: `DEMO_PASSCODE`. If set, the page asks for it before calling, so strangers can't spend your API credits.
3. **Redeploy** the latest `v2-simulated-system` preview (Deployments → ⋯ → Redeploy), or push a new commit.
4. Open the preview link and add `/call.html` to the end of it.

Vercel preview links require a Vercel login. To show Huma, use the **Share** button on the deployment, or add her to the Vercel project.

## Run it on your Mac

```
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000/call.html. It reads secrets from the `.env` file in the project folder (see `.env.example`). Never commit `.env`.

## Demo script

1. Pick **Rosa** and click the suggested question ("Where's my ride? Can the driver come to my door?").
2. Click **Yes, share it**.
3. Watch the call: verification, then the van's ETA and stops before pickup, then the hold while AAR contacts Harborlight, then the ticket number.
4. Ride Assure reads the summary to Rosa.
5. For the caregiver story, pick **Ana** (Dana is asking for her mother).

## What's been tested, and what hasn't

- Tested here, against a copy of the database with a scripted stand-in for Claude: the full call, verification, the account tools staying locked before verifying, a wrong date of birth refused, the vendor hold, saving the call and its transcript, and rejecting a wrong ticket. The page was also checked in a browser at desktop and phone sizes.
- **Not yet tested: the real Claude conversation and the Supabase connection.** Those need your keys, so the first real call should be a practice run.
