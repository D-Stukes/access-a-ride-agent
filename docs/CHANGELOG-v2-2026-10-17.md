# Ride Assure v2: change log for Sat Oct 17, 2026

Branch: `v2-simulated-system` (`main` = v1, untouched). Everything in the demo is simulated.
Each line is a commit you can look up with `git show <hash>`.

## Lady D's five fixes
| Fix | Commits | Status |
| --- | --- | --- |
| 1. Shorter AI call (fewer turns, both sides) | `f0c19b5` | Verified live |
| 2. Never speak or show the AAR ID and birth date | `d361752` | Verified live |
| 3. Hold music plays consistently | built earlier (`e7ed086`, `b103ba9`) | Verified live |
| 4. Choice of music type | built earlier (`e733703`) | Verified live |
| 5. Game while waiting | built earlier (`b103ba9`) | Verified live |

## Music / Game / Mute buttons
- Call screen, plus Mute on the hold and wait screen: `5dd833b`
- Phone home screen: `38c8ac8`
- Mute on the AAR Links list, each link page and the complaint list; Mute also silences the older read-aloud: `e658ae3`

## No more dropped calls
- Root cause, found in Vercel logs: the AI model rejects a forced `tool_choice`. Fixed by offering only `end_call` on the last turn and hanging up with the spoken text if the model does not: `76025e1`
- Quiet retries of brief hiccups: `f646691`
- Failed-call endings and phone number removed; an over-length call redials instead: `bfd6ee4`, `4e12458`

## Answer card
- Repeat button, simulated "Text me this", ticket number read digit by digit: `7efa568`, `5c7c8d1`
- Repeat / Text only after a completed call: `b758a2d`

## Consent step (voice "yes" not heard)
- Ask again instead of ending; "Ask me again" button; no phone-number fallback: `0e69995`
- After two unheard answers: announce auto-connect in 10 seconds unless the rider says stop or taps Stop. Never auto-connects when the microphone cannot hear: `97eff37`

## AAR Links pages
- Pages now show only their names; shorter spoken lines: `e658ae3`
- Vendor record moved behind an info button, with both good and needs-improvement numbers (sample data): `e658ae3`

## Less repetition, and "What screen am I on?"
- Removed the "Back to Ride Assure" announcement every time a rider returns from an AAR link page. Nothing announces screens on its own now.
- New: ask "What screen am I on?" by voice on the home screen, tap the 📍 button on the AAR pages, or tap the link under the Music/Game/Mute row. It says and shows the current screen: `07da7e5`.

## Round 3 (from testing with Huma)
- Microphone: Chrome had the site's microphone set to Denied, so no prompt could appear. The app now explains the Chrome setting on screen and aloud, and Ask me again re-requests the microphone.
- Hold music starts right after "Calling Access-A-Ride now", plays softly through quiet gaps while the AI is thinking, fades out before anyone speaks, and carries into the hold screen.
- Marisol no longer mentions complaints or vendor records. A "Vendor report" button on the answer card shows and speaks a balanced record only when tapped.
- Removed the "Opening the official page" announcement. (The "Back to Ride Assure" announcement was removed earlier; the live build no longer contains it.)

## App Notes
- New nav link and page with How It Works, Architecture, Safety and The Agent: `c26034d`
- Wording updated for v2 (no "Week 4" promises): `ca7afbf`

## Notes and documents
- Handoff notes: `e520e14`
- Fork and clone notes: `c8f6520`

## Still to check on the live preview
- Silent-consent path and auto-connect countdown (`97eff37`)
- Vendor record info button (`e658ae3`)
- Music and Mute on the call screen
- Voice "yes" in Chrome is still unreliable; tap Yes as the fallback
