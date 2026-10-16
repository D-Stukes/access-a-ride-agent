// Ride Assure v2, inside the v1 design.
// When the rider taps (or says) a ride question on the phone, Ride Assure now really calls the
// SIMULATED Access-A-Ride line: it asks permission to share the rider's AAR ID and date of birth,
// Marisol (the simulated AAR rep) verifies the caller, checks the van, puts Ride Assure on hold
// while she contacts the vendor, and gives a ticket number. After the call, "While you wait" lets
// the rider play a game or listen to music until the van is 5 minutes away and then on the block.
// If the live call can't start (no server, no keys), the v1 recorded call plays instead, so the
// demo never breaks.
(function () {
  if (typeof window.aarCallDemo !== "function") return;
  const v1Call = window.aarCallDemo;

  const AAR_NUMBER = "877-337-2017";
  // Ms. R on the phone is Rosa Tavares, a demo rider in the simulated AAR database.
  const RIDER = { firstName: "Rosa", lastName: "Tavares", aarId: "100234", dob: "1948-03-14", needs: "Wheelchair; needs door-to-door help" };
  const LIVE_KEYS = new Set(["where", "late", "remind", "missed", "wait"]);
  const COMPLAINT = {
    late: { text: "Harborlight Mobility · late pickup", tag: "Late", cls: "late" },
    missed: { text: "Harborlight Mobility · the driver did not call out and assist", tag: "No assist", cls: "assist" },
  };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const $make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lightPipe = (n) => document.querySelectorAll("#pipeline li").forEach((li, i) => li.classList.toggle("on", i <= n));

  let run = null;     // the call in progress
  let wait = null;    // the "While you wait" countdown

  window.aarCallDemo = function (btn, key) {
    if (!LIVE_KEYS.has(key) || window.RA_V1_ONLY) return v1Call(btn, key);
    liveCall(btn, key);
  };

  // ------------------------------------------------------------------ voices
  function voices() { try { return (window.aarGoodVoices && window.aarGoodVoices()) || speechSynthesis.getVoices(); } catch (e) { return []; } }
  function agentVoice() { try { return window.aarPickVoice && window.aarPickVoice(); } catch (e) { return null; } }
  function repVoice() {
    const a = agentVoice(); const list = voices().filter((v) => /^en/i.test(v.lang) && (!a || v.name !== a.name));
    return list.find((v) => /samantha|zira|female|jenny|aria|google us english/i.test(v.name)) || list[0] || a;
  }
  function speakAs(text, who) {
    return new Promise((resolve) => {
      let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
      const backup = 900 + String(text).split(/\s+/).length * 430;
      try {
        if (!window.speechSynthesis) { setTimeout(fin, Math.min(backup, 4000)); return; }
        const u = new SpeechSynthesisUtterance(text);
        const v = who === "rep" ? repVoice() : agentVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
        u.rate = 0.95; u.pitch = who === "rep" ? 1.08 : 1;
        (window.__aarUtts = window.__aarUtts || []).push(u);
        u.onend = u.onerror = fin;
        speechSynthesis.speak(u);
        setTimeout(fin, backup);
      } catch (e) { setTimeout(fin, 800); }
    });
  }
  function hush() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }

  function listenOnce() {
    return new Promise((resolve) => {
      if (!SR) return resolve(null);
      let r; try { r = new SR(); } catch (e) { return resolve(null); }
      r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
      let heard = null;
      r.onresult = (e) => { heard = e.results[0][0].transcript; };
      r.onend = () => resolve(heard);
      r.onerror = () => {};
      if (run) run.rec = r;
      try { r.start(); } catch (e) { resolve(null); }
    });
  }
  function yesOrNo(t) {
    const s = String(t || "").toLowerCase();
    if (/\b(no|nope|don't|do not|stop|cancel)\b/.test(s)) return "no";
    if (/\b(yes|yeah|yep|yup|sure|okay|ok|go ahead|please|share|correct|alright|all right)\b/.test(s)) return "yes";
    return null;
  }

  // ------------------------------------------------------------------ sounds
  let ac = null;
  function ctx() { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); return ac; }
  function ring(times) {
    return new Promise((resolve) => {
      try {
        const a = ctx(), t0 = a.currentTime + 0.05, on = 1.4, off = 0.8;
        for (let i = 0; i < times; i++) {
          const g = a.createGain(); g.gain.value = 0; g.connect(a.destination);
          [440, 480].forEach((f) => { const o = a.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t0 + i * (on + off)); o.stop(t0 + i * (on + off) + on); });
          g.gain.setValueAtTime(0, t0 + i * (on + off)); g.gain.linearRampToValueAtTime(0.07, t0 + i * (on + off) + 0.03);
          g.gain.setValueAtTime(0.07, t0 + i * (on + off) + on - 0.05); g.gain.linearRampToValueAtTime(0, t0 + i * (on + off) + on);
        }
        setTimeout(resolve, times * (on + off) * 1000);
      } catch (e) { setTimeout(resolve, 1500); }
    });
  }
  function hangupBeep() {
    try { const a = ctx(); [0, 0.18, 0.36].forEach((d) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 620; g.gain.value = 0.05; o.connect(g); g.connect(a.destination); o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.12); }); } catch (e) {}
  }
  function chime() {
    try { const a = ctx(); [[660, 0], [880, 0.22]].forEach(([f, d]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, a.currentTime + d); g.gain.exponentialRampToValueAtTime(0.12, a.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d + 0.5); o.connect(g); g.connect(a.destination); o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.55); }); } catch (e) {}
  }

  // ------------------------------------------------------------------ server
  async function api(body) {
    const res = await fetch("api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || "The call dropped."), { data, status: res.status });
    return data;
  }

  // ------------------------------------------------------------------ the call
  function cleanup() {
    if (!run) return;
    run.dead = true;
    if (run.rec) { try { run.rec.abort(); } catch (e) {} }
    if (run.music) { try { run.music.pause(); } catch (e) {} }
    if (run.endHold) run.endHold();
    hush();
    if (run.ui && run.ui.parentNode) run.ui.remove();
    if (run.btn) run.btn.classList.remove("speaking");
    run = null;
  }

  async function liveCall(btn, key) {
    cleanup();
    document.querySelectorAll(".call-ui").forEach((x) => x.remove());   // a v1 call, if one is open
    document.querySelectorAll(".cmd.selected, .choice.selected").forEach((x) => x.classList.remove("selected"));
    btn.classList.add("selected", "speaking"); btn.setAttribute("aria-pressed", "true");
    const phone = btn.closest(".phone");
    phone.querySelectorAll(".last-answer, .v2-wait-btn").forEach((x) => x.remove());
    const said = btn.innerText.trim().replace(/^["“]+|["”]+$/g, "");
    const me = run = { btn, phone, key, said };
    const alive = () => run === me && !me.dead;

    const ui = $make("div", "call-ui v2");
    ui.setAttribute("role", "dialog"); ui.setAttribute("aria-label", "Ride Assure calling Access-A-Ride");
    ui.innerHTML = `
      <p class="who">You asked</p><p class="said"></p>
      <p class="who">Ride Assure</p><p class="agent-line"></p>
      <div class="v2-consent"><button type="button" class="app-btn solid" data-yes>Yes, share it</button><button type="button" class="app-btn line" data-no>No</button></div>
      <p class="v2-heard" aria-live="polite"></p>
      <div class="call-avatar" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="#0E1726"/></svg></div>
      <p class="call-name">Access-A-Ride</p>
      <p class="call-num">${AAR_NUMBER} · simulated line</p>
      <p class="call-status" aria-live="polite"></p>
      <div class="call-wave" hidden aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="v2-log" hidden aria-live="polite"></div>
      <button class="end-call" type="button" aria-label="End call"><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14c5-4.5 13-4.5 18 0l-2 3-4-1.5v-2.2a10 10 0 0 0-6 0v2.2L5 17z" fill="#fff"/></svg></button>
      <p class="end-label">End call</p>`;
    const q = (s) => ui.querySelector(s);
    q(".said").textContent = "“" + said + "”";
    const ask = "I'll call Access-A-Ride for you. May I share your AAR ID and date of birth with them?";
    q(".agent-line").textContent = ask;
    const status = q(".call-status"), avatar = q(".call-avatar"), wave = q(".call-wave"), log = q(".v2-log");
    phone.appendChild(ui); me.ui = ui;
    lightPipe(1);
    q("[data-yes]").focus();

    let summary = "", ticket = "", hungUp = false, failed = false;
    q(".end-call").onclick = () => { hungUp = true; me.hangup && me.hangup(); };

    // 1) ask permission (tap or say yes / no)
    const decision = await new Promise((resolve) => {
      let done = false;
      const pick = (d) => { if (!done) { done = true; if (me.rec) { try { me.rec.abort(); } catch (e) {} } resolve(d); } };
      me.hangup = () => pick("hangup");
      q("[data-yes]").onclick = () => { unlockHold(me); pick("yes"); };
      q("[data-no]").onclick = () => pick("no");
      (async () => {
        await speakAs(ask, "agent");
        for (let i = 0; i < 3 && !done && alive(); i++) {
          q(".v2-heard").textContent = SR ? "Listening… say yes or no" : "";
          const heard = await listenOnce();
          if (done || !alive()) return;
          const d = yesOrNo(heard);
          q(".v2-heard").textContent = heard ? "Heard: “" + heard + "”" : "";
          if (d) { if (d === "yes") unlockHold(me); return pick(d); }
        }
        if (!done) q(".v2-heard").textContent = "Tap Yes or No.";
      })();
    });
    if (!alive()) return;
    q(".v2-consent").remove(); q(".v2-heard").remove();

    if (decision !== "yes") {
      const msg = decision === "no" ? "Okay, I won't share it, so I can't call for you. You can call Access-A-Ride at 877-337-2017." : "Okay, I didn't call.";
      q(".agent-line").textContent = msg;
      await speakAs(msg, "agent");
      return finish({ big: decision === "no" ? "No call was made." : "Call cancelled.", sub: "You can call Access-A-Ride at 877-337-2017.", speak: false });
    }

    // 2) dial, while the server opens the call
    q(".agent-line").textContent = "Thank you. Calling Access-A-Ride now. You can watch and listen to the call.";
    await speakAs("Thank you. Calling Access-A-Ride now.", "agent");
    if (!alive()) return;
    lightPipe(2);
    status.textContent = "Calling…"; avatar.classList.add("ringing");
    let started;
    try {
      [started] = await Promise.all([api({ action: "start", rider: { ...RIDER, request: said } }), ring(2)]);
    } catch (err) {
      console.warn("[Ride Assure v2] live call unavailable, playing the v1 call instead:", err.message);
      cleanup();
      return v1Call(btn, key);
    }
    if (!alive()) return;
    avatar.classList.remove("ringing");
    ui.classList.add("connected"); log.hidden = false; wave.hidden = false;
    status.textContent = "Connected · Marisol, AAR (simulated)";
    me.trip = started.trip;
    updateTripStrip(phone, started.trip, "On the way");

    // 3) the conversation, one step at a time
    me.hangup = () => { hush(); if (me.music) { try { me.music.pause(); } catch (e) {} } if (me.endHold) me.endHold(); };
    let state = started.state;
    try {
      for (let n = 0; n < 24 && !state.done && !hungUp && alive(); n++) {
        const out = await api({ action: "step", callId: started.callId, ticket: started.ticket, state });
        state = out.state;
        for (const e of out.events) {
          if (hungUp || !alive()) break;
          if (e.type === "say") {
            addLine(log, e.who, e.text);
            await speakAs(e.text, e.who);
          } else if (e.type === "note") {
            addChip(log, e.text, /^Caller verified/.test(e.text));
          } else if (e.type === "hold") {
            lightPipe(3);
            status.textContent = "On hold · calling the vendor";
            wave.classList.add("hold");
            const h = $make("div", "v2-hold"); h.innerHTML = '<i aria-hidden="true">♫</i><span></span>';
            h.lastElementChild.textContent = "On hold while AAR contacts the vendor. Smooth jazz is playing.";
            log.appendChild(h); log.scrollTop = log.scrollHeight;
            await playHold(me, phone, alive);
          } else if (e.type === "hold_end") {
            wave.classList.remove("hold");
            status.textContent = "Connected · Marisol, AAR (simulated)";
            addChip(log, "Back on the line");
          } else if (e.type === "summary") {
            summary = e.text;
          } else if (e.type === "done") {
            ticket = e.ticket || "";
          }
        }
      }
    } catch (err) {
      console.warn("[Ride Assure v2] call dropped:", err.message);
      failed = true;
    }
    if (!alive()) return;

    // 4) hang up, then tell the rider
    hangupBeep();
    avatar.classList.remove("ringing"); wave.hidden = true;
    status.textContent = hungUp ? "You ended the call." : failed ? "The call dropped." : "Call ended.";
    lightPipe(4);
    await sleep(1300);
    if (!alive()) return;
    if (hungUp) return finish({ big: "You ended the call.", sub: "Tap a button any time to call again.", speak: false });
    if (failed || !summary) return finish({ big: "The call dropped before I got an answer.", sub: "Please try again, or call Access-A-Ride at 877-337-2017.", speak: true });
    const first = summary.match(/^[^.!?]+[.!?]/);
    finish({ big: first ? first[0] : summary, sub: first ? summary.slice(first[0].length).trim() : "", ticket, summary, speak: true, wait: true });

    function finish(a) {
      if (!alive()) return;
      ui.classList.add("closing");
      setTimeout(() => {
        if (!alive()) return;
        if (ui.parentNode) ui.remove();
        btn.classList.remove("speaking");
        showAnswer(phone, a, key);
        const said = a.speak ? speakAs(a.summary || [a.big, a.sub].join(" "), "agent") : Promise.resolve();
        if (a.wait) said.then(resumeWait);   // the countdown starts once the answer has been read
        run = null;
      }, 300);
    }
  }

  function addLine(log, who, text) {
    const d = $make("div", "v2-line " + (who === "rep" ? "rep" : "agent"));
    d.append($make("small", null, who === "rep" ? "Marisol · AAR" : "Ride Assure"), document.createTextNode(text));
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  function addChip(log, text, ok) { log.appendChild($make("span", "v2-chip" + (ok ? " ok" : ""), text)); log.scrollTop = log.scrollHeight; }

  const HOLD_FILE = "assets/music/jazz-rainy-lounge.mp3";
  const HOLD_MS = 20000;   // how long Ride Assure stays on hold in the demo
  function unlockHold(me) {
    if (me.holdAudio) return;
    const a = new Audio(HOLD_FILE); a.loop = true; a.preload = "auto"; me.holdAudio = a;
    a.volume = 0; a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
  }
  // On hold: smooth jazz plays, and the rider can switch music or play a game until Marisol is back
  async function playHold(me, phone, alive) {
    const a = me.holdAudio || new Audio(HOLD_FILE);
    me.music = a; a.loop = true; a.volume = 0.7;
    try { a.currentTime = 0; } catch (e) {}
    hush();
    a.play().catch((err) => console.warn("[Ride Assure v2] hold music blocked:", err.message));
    const sheet = buildSheet(phone, "hold", a);
    me.holdSheet = sheet;
    const t0 = Date.now();
    await new Promise((resolve) => {
      const iv = setInterval(() => {
        const left = Math.max(0, HOLD_MS - (Date.now() - t0));
        sheet.querySelector(".v2-eta .num").textContent = Math.ceil(left / 1000);
        sheet.querySelector(".v2-bar i").style.width = (100 - (left / HOLD_MS) * 100) + "%";
        if (left <= 0 || !alive()) { clearInterval(iv); resolve(); }
      }, 250);
      me.endHold = () => { clearInterval(iv); me.endHold = null; resolve(); };
    });
    me.endHold = null;
    const music = sheet.audio || a;
    for (let v = music.volume; v > 0.02; v -= 0.07) { music.volume = Math.max(0, v); await sleep(50); }
    [a, music].forEach((x) => { try { x.pause(); } catch (e) {} });
    if (me.music === a) me.music = null;
    if (alive()) {
      sheet.querySelectorAll(".v2-alert").forEach((x) => x.remove());
      const box = $make("div", "v2-alert block"); box.setAttribute("role", "alert");
      box.append($make("p", null, "Marisol is back on the line."));
      sheet.appendChild(box);
      chime();
      await sleep(1600);
    }
    sheet.remove(); me.holdSheet = null;
  }

  function updateTripStrip(phone, trip, statusText) {
    const strip = phone.querySelector(".trip-strip"); if (!strip) return;
    const first = strip.firstElementChild, pill = strip.querySelector(".trip-status");
    if (trip && first) first.innerHTML = "<b>Pickup " + trip.pickup + "</b> · Trip " + trip.tripId;
    if (pill && statusText) pill.textContent = statusText;
  }

  // The answer card above the options (v1 style), plus the ticket and "While you wait"
  function showAnswer(phone, a, key) {
    phone.querySelectorAll(".last-answer, .v2-wait-btn").forEach((x) => x.remove());
    const list = phone.querySelector(".opt-list, .choice-list");
    const box = $make("div", "last-answer"); box.setAttribute("role", "status");
    box.innerHTML = '<div class="la-top"><span class="la-tag">Ride Assure · after calling AAR</span><button type="button" class="la-x" aria-label="Dismiss answer">×</button></div>';
    box.append($make("p", "la-big", a.big));
    if (a.sub) box.append($make("p", "la-sub", a.sub));
    if (a.ticket) box.append($make("span", "v2-ticket", "Ticket " + a.ticket));
    if (a.wait && COMPLAINT[key]) {
      const row = $make("div", "app-row");
      const yes = $make("button", "app-btn solid sm", "Yes, save it"); yes.type = "button";
      const no = $make("button", "app-btn line sm", "No"); no.type = "button";
      const qn = $make("p", null, "Save this to your trip complaint list?"); qn.style.cssText = "margin:8px 0 0;font-weight:700;font-size:14px";
      yes.onclick = () => { try { window.raAddComplaint && window.raAddComplaint(COMPLAINT[key]); } catch (e) {} speakAs("Saved to your trip complaint list.", "agent"); qn.remove(); row.replaceWith($make("p", "logged", "Saved to your trip complaint list (demo).")); };
      no.onclick = () => { speakAs("Okay, nothing was saved.", "agent"); qn.remove(); row.replaceWith($make("p", "logged", "Okay, nothing was saved.")); };
      row.append(yes, no); box.append(qn, row);
    }
    box.querySelector(".la-x").onclick = () => { hush(); box.remove(); };
    list.parentNode.insertBefore(box, list);
    const m = (a.summary || "").match(/(\d{1,2})\s*minutes?/i);
    if (a.wait && !m) a.wait = false;   // no van on the way (no time given): nothing to wait for
    if (a.wait) {
      const eta = +m[1] >= 3 && +m[1] <= 60 ? +m[1] : 15;
      startWait(phone, eta);
      const wb = $make("button", "v2-wait-btn"); wb.type = "button";
      wb.innerHTML = '<span><b>While you wait</b><small>Play a game or listen to music</small></span><span class="eta"></span>';
      wb.onclick = () => openWait(phone);
      list.parentNode.insertBefore(wb, list);
      tickWait();
    }
    list.scrollTop = 0;
  }

  // ------------------------------------------------------------------ While you wait
  const DEMO_MS_PER_MIN = 3000;   // demo clock: 1 minute of waiting goes by in 3 seconds
  function startWait(phone, etaMin) {
    stopWait();
    wait = { phone, etaMin, t0: null, msPerMin: DEMO_MS_PER_MIN, base: 0, alerted5: etaMin <= 5, alertedBlock: false, timer: null, audio: null };
  }
  function resumeWait() {
    if (!wait || wait.t0 !== null || wait.alertedBlock) return;
    wait.t0 = Date.now();
    wait.timer = setInterval(tickWait, 500);
  }
  function stopWait() {
    if (!wait) return;
    clearInterval(wait.timer);
    if (wait.audio) { try { wait.audio.pause(); } catch (e) {} }
    if (wait.sheet) wait.sheet.remove();
    wait = null;
  }
  function remaining() {
    if (!wait) return 0;
    const ran = wait.t0 === null ? 0 : (Date.now() - wait.t0) / wait.msPerMin;
    return Math.max(0, wait.etaMin - wait.base - ran);
  }
  function setSpeed(msPerMin) {
    if (!wait) return;
    if (wait.t0 !== null) { wait.base += (Date.now() - wait.t0) / wait.msPerMin; wait.t0 = Date.now(); }
    wait.msPerMin = msPerMin;
    renderSpeed();
  }
  function minsText(r) { const m = Math.ceil(r); return r <= 1 ? "On your block" : m + " min"; }
  function tickWait() {
    if (!wait) return;
    const r = remaining(), phone = wait.phone;
    const etaEl = phone.querySelector(".v2-wait-btn .eta"); if (etaEl) etaEl.textContent = minsText(r);
    updateTripStrip(phone, null, r <= 1 ? "On your block" : Math.ceil(r) + " min");
    if (wait.sheet) {
      wait.sheet.querySelector(".v2-eta .num").textContent = r <= 1 ? "✓" : Math.ceil(r);
      wait.sheet.querySelector(".v2-eta .lbl b").textContent = r <= 1 ? "Your van is on your block" : "minutes until your van arrives";
      wait.sheet.querySelector(".v2-eta .lbl small").textContent = r <= 1 ? "Please head to the door." : "I'll pause for you at 5 minutes, and when it's on your block.";
      wait.sheet.querySelector(".v2-bar i").style.width = Math.min(100, (1 - r / wait.etaMin) * 100) + "%";
    }
    if (!wait.alerted5 && r <= 5) { wait.alerted5 = true; vanAlert("five"); }
    if (!wait.alertedBlock && r <= 1) { wait.alertedBlock = true; clearInterval(wait.timer); wait.timer = null; vanAlert("block"); }
  }

  function openWait(phone) {
    if (!wait) return;
    if (!wait.sheet) buildWait(phone);
    wait.sheet.hidden = false;
    resumeWait();
    tickWait();
    wait.sheet.querySelector(".v2-x").focus();
  }

  function buildWait(phone) {
    const audio = new Audio(); audio.loop = true; audio.volume = 0.6;
    wait.audio = audio;
    wait.sheet = buildSheet(phone, "wait", audio);
    renderSpeed();
  }
  function buildSheet(phone, mode, audio) {
    const hold = mode === "hold";
    const s = $make("div", "v2-wait"); s.setAttribute("role", "dialog"); s.setAttribute("aria-label", hold ? "While you're on hold" : "While you wait");
    s.innerHTML = `
      <div class="v2-wait-top"><h3></h3><button type="button" class="v2-x">${hold ? "Back to the call" : "Close"}</button></div>
      <div class="v2-eta"><span class="num"></span><span class="lbl"><b></b><small></small><span class="v2-bar"><i></i></span></span></div>
      <div class="v2-tabs" role="group" aria-label="Choose one">
        <button type="button" class="v2-tab" data-tab="game" aria-pressed="false">\uD83C\uDFAE Play a game</button>
        <button type="button" class="v2-tab" data-tab="music" aria-pressed="false">\uD83C\uDFB5 Listen to music</button>
      </div>
      <div class="v2-pane" data-pane="pick"><div class="v2-pick"><p class="big">What would you like to do?</p><p>Pick a game or some music. You can switch any time.</p></div></div>
      <div class="v2-pane" data-pane="game" hidden></div>
      <div class="v2-pane" data-pane="music" hidden></div>
      <p class="v2-speed"></p>`;
    s.querySelector("h3").textContent = hold ? "While you're on hold" : "While you wait";
    s.querySelector(".num").textContent = hold ? Math.round(HOLD_MS / 1000) : "15";
    s.querySelector(".lbl b").textContent = hold ? "seconds \u00B7 Marisol is checking with the vendor" : "minutes until your van arrives";
    s.querySelector(".lbl small").textContent = hold ? "Smooth jazz is playing. Pick other music, or play a game." : "I'll pause for you at 5 minutes, and when it's on your block.";
    s.audio = audio;
    phone.appendChild(s);
    s.querySelector(".v2-x").onclick = () => { s.hidden = true; };
    s.querySelectorAll(".v2-tab").forEach((t) => t.onclick = () => showTab(s, t.dataset.tab));
    buildGame(s.querySelector('[data-pane="game"]'));
    buildMusic(s.querySelector('[data-pane="music"]'), audio, hold ? "Jazz" : null);
    if (hold) showTab(s, "music");
    return s;
  }
  function renderSpeed() {
    if (!wait || !wait.sheet) return;
    const p = wait.sheet.querySelector(".v2-speed");
    const fast = wait.msPerMin === DEMO_MS_PER_MIN;
    p.innerHTML = fast ? "Demo clock: 1 minute goes by in 3 seconds. " : "Real time. ";
    const b = $make("button", null, fast ? "Use real time" : "Use the demo clock"); b.type = "button";
    b.onclick = () => setSpeed(fast ? 60000 : DEMO_MS_PER_MIN);
    p.appendChild(b);
  }
  function showTab(s, name) {
    s.querySelectorAll(".v2-tab").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.tab === name)));
    s.querySelectorAll(".v2-pane").forEach((p) => p.hidden = p.dataset.pane !== name);
  }

  // memory game: find the matching pairs
  function buildGame(pane) {
    const ICONS = ["🚐", "🌻", "☕", "🎵", "🐦", "🍎"];
    pane.innerHTML = '<div class="v2-game-head"><span>Find the matching pairs</span><span class="moves">Turns: 0</span></div><div class="v2-cards"></div><p class="v2-win" hidden></p>';
    const grid = pane.querySelector(".v2-cards"), movesEl = pane.querySelector(".moves"), win = pane.querySelector(".v2-win");
    let open = [], moves = 0, matched = 0, lock = false;
    const deck = [...ICONS, ...ICONS].sort(() => Math.random() - 0.5);
    grid.innerHTML = "";
    deck.forEach((ic, i) => {
      const c = $make("button", "v2-card"); c.type = "button"; c.dataset.icon = ic; c.setAttribute("aria-label", "Card " + (i + 1));
      c.onclick = () => {
        if (lock || c.classList.contains("up") || c.classList.contains("done")) return;
        c.classList.add("up"); c.textContent = ic; open.push(c);
        if (open.length < 2) return;
        moves++; movesEl.textContent = "Turns: " + moves;
        const [a, b] = open; open = [];
        if (a.dataset.icon === b.dataset.icon) {
          a.classList.add("done"); b.classList.add("done"); matched++;
          if (matched === ICONS.length) {
            win.hidden = false; win.textContent = "You matched them all in " + moves + " turns! ";
            const again = $make("button", "app-btn line sm", "Play again"); again.type = "button"; again.style.marginTop = "8px";
            again.onclick = () => buildGame(pane);
            win.appendChild(again);
            const sheetAudio = pane.closest(".v2-wait") && pane.closest(".v2-wait").audio;
            if (!(sheetAudio && !sheetAudio.paused)) speakAs("You matched them all. Nice work!", "agent");
          }
        } else {
          lock = true;
          setTimeout(() => { [a, b].forEach((x) => { x.classList.remove("up"); x.textContent = ""; }); lock = false; }, 900);
        }
      };
      grid.appendChild(c);
    });
  }

  // music: pick a genre
  const FALLBACK_TRACKS = { genres: [
    { genre: "Jazz", tracks: [{ title: "Jazz Rainy Lounge", artist: "Alex Morgan", file: "jazz-rainy-lounge.mp3" }] },
    { genre: "Gospel", tracks: [{ title: "Walk in the Light", artist: "jeremiah7", file: "gospel-walk-in-the-light.mp3" }] },
    { genre: "Country", tracks: [{ title: "Backroads", artist: "Pixabay", file: "country-backroads.mp3" }] },
    { genre: "Soul", tracks: [{ title: "RnB Soul Background", artist: "Tunetank", file: "soul-rnb-background.mp3" }, { title: "Soul RnB Music", artist: "Tunetank", file: "soul-rnb-music.mp3" }] },
  ] };
  const PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#fff"/></svg>';
  const PAUSE = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="#fff"/><rect x="14" y="5" width="4" height="14" fill="#fff"/></svg>';
  async function buildMusic(pane, audio, current) {
    let data = FALLBACK_TRACKS;
    try { const r = await fetch("assets/music/tracks.json"); if (r.ok) data = await r.json(); } catch (e) {}
    pane.innerHTML = '<div class="v2-genres" role="group" aria-label="Music"></div><div class="v2-now"><div class="t"><b>Pick a style of music</b><small>Smooth jazz, gospel, country, or soul</small></div><button type="button" class="v2-play" aria-label="Play">' + PLAY + '</button></div><label class="v2-vol">Volume <input type="range" min="0" max="1" step="0.05" value="0.6"></label>';
    const gWrap = pane.querySelector(".v2-genres"), title = pane.querySelector(".t b"), sub = pane.querySelector(".t small"), play = pane.querySelector(".v2-play"), vol = pane.querySelector("input");
    const counts = {};
    const sync = () => { play.innerHTML = audio.paused ? PLAY : PAUSE; play.setAttribute("aria-label", audio.paused ? "Play" : "Pause"); };
    audio.onplay = audio.onpause = sync;
    data.genres.forEach((g) => {
      const b = $make("button", "v2-genre", g.genre === "Jazz" ? "Smooth jazz" : g.genre); b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.onclick = () => {
        const i = counts[g.genre] = ((counts[g.genre] ?? -1) + 1) % g.tracks.length;
        const t = g.tracks[i];
        gWrap.querySelectorAll(".v2-genre").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        audio.src = "assets/music/" + t.file; audio.play().catch(() => {});
        title.textContent = t.title; sub.textContent = (g.genre === "Jazz" ? "Smooth jazz" : g.genre) + " · " + t.artist;
      };
      gWrap.appendChild(b);
    });
    vol.value = audio.volume || 0.6;
    if (current) {   // music already playing (the hold music): show it as the current pick
      const g = data.genres.find((x) => x.genre === current);
      const i = data.genres.indexOf(g);
      if (g) {
        counts[g.genre] = 0;
        gWrap.children[i].setAttribute("aria-pressed", "true");
        title.textContent = g.tracks[0].title; sub.textContent = (g.genre === "Jazz" ? "Smooth jazz" : g.genre) + " \u00B7 " + g.tracks[0].artist;
      }
    }
    sync();
    play.onclick = () => {
      if (!audio.src) { gWrap.querySelector(".v2-genre").click(); return; }
      audio.paused ? audio.play().catch(() => {}) : audio.pause();
    };
    vol.oninput = () => { audio.volume = +vol.value; };
  }

  // "Your van is 5 minutes away" and "Your van is on your block"
  function vanAlert(kind) {
    if (!wait) return;
    const phone = wait.phone;
    if (!wait.sheet) buildWait(phone);
    const s = wait.sheet; s.hidden = false;
    s.querySelectorAll(".v2-alert").forEach((x) => x.remove());
    const playing = wait.audio && !wait.audio.paused;
    if (wait.audio) wait.audio.pause();
    const msg = kind === "five"
      ? "Rosa, your van is about 5 minutes away. Time to start getting ready."
      : "Rosa, your van is on your block. Please head to the door. Your driver will call you.";
    const box = $make("div", "v2-alert" + (kind === "block" ? " block" : "")); box.setAttribute("role", "alert");
    box.append($make("p", null, msg));
    const row = $make("div", "app-row");
    if (kind === "five") {
      const keep = $make("button", "app-btn sm", playing ? "Keep listening" : "Keep playing"); keep.type = "button";
      keep.onclick = () => { box.remove(); if (playing) wait.audio.play().catch(() => {}); };
      row.append(keep);
    } else {
      const go = $make("button", "app-btn sm", "I'm on my way"); go.type = "button";
      go.onclick = () => { updateTripStrip(phone, null, "Van is here"); stopWait(); phone.querySelectorAll(".v2-wait-btn").forEach((x) => x.remove()); };
      row.append(go);
    }
    box.append(row);
    s.appendChild(box);
    chime();
    setTimeout(() => speakAs(msg, "agent"), 500);
    row.querySelector("button").focus();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (wait && wait.sheet && !wait.sheet.hidden) { wait.sheet.hidden = true; return; }
    if (run && run.ui) run.ui.querySelector(".end-call")?.click();
  });
})();
