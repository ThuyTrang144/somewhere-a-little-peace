/* Somewhere, A Little Peace - audio.js
 * Fully synthesized sound (Web Audio API). No files, no worklets, works from file://.
 * Implements Peace.audio (SPEC section 4) and the AUDIO package (section 5).
 */
(function () {
  'use strict';

  var Peace = window.Peace = window.Peace || {};

  /* ------------------------------------------------------------------ */
  /* constants + persisted state                                         */
  /* ------------------------------------------------------------------ */

  var STORE_KEY = 'peace.audio';
  var LOOK = 0.45;      // scheduling lookahead, seconds
  var TICK_MS = 110;    // scheduler interval

  var TRACKS = [
    { id: 'piano', name: 'Peaceful piano' },
    { id: 'guitar', name: 'Soft acoustic guitar' },
    { id: 'instrumental', name: 'Gentle instrumental' }
  ];
  var AMBIENTS = [
    { id: 'rain', name: 'Rainy afternoon' },
    { id: 'birds', name: 'Morning birds' },
    { id: 'forest', name: 'Forest' },
    { id: 'fire', name: 'Fireplace' },
    { id: 'ocean', name: 'Ocean waves' },
    { id: 'wind', name: 'Gentle wind' },
    { id: 'night', name: 'Night crickets' }
  ];
  var AMB_IDS = AMBIENTS.map(function (a) { return a.id; });

  var st = { master: 0.8, musicVol: 0.6, track: 'piano', ov: {}, muted: false };
  var wantMusic = false;     // visitor intent: music should be playing
  var sceneAmb = {};         // scene default mix

  var ctx = null, unlocked = false;
  var N = {};                // shared nodes
  var noise = {};            // pre-rendered noise buffers
  var ksCache = {};          // Karplus-Strong buffers by midi note
  var amb = {};              // ambient records by id
  var curTrack = null;
  var tickTimer = null;

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */

  var rnd = Math.random;
  function R(a, b) { return a + rnd() * (b - a); }
  function pick(a) { return a[(rnd() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isTrack(id) { for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return true; return false; }

  function save() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        master: st.master, musicVol: st.musicVol, track: st.track, ov: st.ov, muted: st.muted
      }));
    } catch (e) { /* storage may be blocked */ }
  }
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      if (isNum(o.master)) st.master = clamp(o.master, 0, 1);
      if (isNum(o.musicVol)) st.musicVol = clamp(o.musicVol, 0, 1);
      if (isTrack(o.track)) st.track = o.track;
      st.muted = !!o.muted;
      if (o.ov && typeof o.ov === 'object') {
        for (var i = 0; i < AMB_IDS.length; i++) {
          var v = o.ov[AMB_IDS[i]];
          if (isNum(v)) st.ov[AMB_IDS[i]] = clamp(v, 0, 1);
        }
      }
    } catch (e) { /* ignore */ }
  }
  function emit() {
    try { if (typeof Peace.emit === 'function') Peace.emit('audio:change'); } catch (e) { /* ignore */ }
  }

  /* ---- node helpers (valid only once ctx exists) ---- */

  function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
  function osc(type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function filt(type, f, q) {
    var n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = (q === undefined ? 0.7 : q); return n;
  }
  function panner(p) {
    if (!ctx.createStereoPanner) return null;
    var n = ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n;
  }
  function link() {
    var prev = null;
    for (var i = 0; i < arguments.length; i++) {
      var n = arguments[i];
      if (!n) continue;
      if (prev) prev.connect(n);
      prev = n;
    }
    return prev;
  }
  function disc() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) { try { arguments[i].disconnect(); } catch (e) { /* ignore */ } }
    }
  }
  function onEnd(src, list) {
    src.onended = function () { for (var i = 0; i < list.length; i++) disc(list[i]); };
  }
  // smooth, click-free parameter move
  function ramp(param, v, tc) {
    var t = ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.setTargetAtTime(v, t, Math.max(0.005, tc || 0.1));
    } catch (e) { try { param.value = v; } catch (e2) { /* ignore */ } }
  }
  function loopSrc(buf) {
    var s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, rnd() * buf.duration * 0.9);
    return s;
  }
  function shotSrc(buf, t, dur) {
    var s = ctx.createBufferSource();
    s.buffer = buf;
    s.start(t, rnd() * Math.max(0, buf.duration - dur - 0.2));
    s.stop(t + dur + 0.05);
    return s;
  }
  function stopAll(list, extra) {
    for (var i = 0; i < list.length; i++) { try { list[i].stop(); } catch (e) { /* ignore */ } disc(list[i]); }
    if (extra) disc(extra);
  }

  /* short filtered noise burst (crackle, click, knock) */
  function burst(out, t, buf, dur, type, f, q, vol, tau, pan) {
    var s = shotSrc(buf, t, dur), bq = filt(type, f, q), g = gain(0), p = panner(pan || 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.001);
    g.gain.setTargetAtTime(0, t + 0.001, tau);
    link(s, bq, g, p, out);
    onEnd(s, [bq, g, p]);
  }

  /* ------------------------------------------------------------------ */
  /* graph construction                                                  */
  /* ------------------------------------------------------------------ */

  function makeNoise() {
    var sr = ctx.sampleRate, len = Math.floor(sr * 8), i, d, peak, w;
    var white = ctx.createBuffer(1, len, sr), pink = ctx.createBuffer(1, len, sr), brown = ctx.createBuffer(1, len, sr);
    var dw = white.getChannelData(0), dp = pink.getChannelData(0), db = brown.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (i = 0; i < len; i++) {
      w = rnd() * 2 - 1;
      dw[i] = w * 0.8;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      dp[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      last = (last + 0.02 * w) / 1.02; db[i] = last;
    }
    var bufs = [pink, brown];
    for (var k = 0; k < bufs.length; k++) {
      d = bufs[k].getChannelData(0); peak = 0.0001;
      for (i = 0; i < len; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
      var sc = 0.8 / peak;
      for (i = 0; i < len; i++) d[i] *= sc;
    }
    noise.white = white; noise.pink = pink; noise.brown = brown;
  }

  function makeImpulse(sec) {
    var sr = ctx.sampleRate, len = Math.floor(sr * sec), buf = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) {
        var t = i / sr, x = i / len;
        var env = Math.exp(-2.3 * t) * Math.min(1, i / (sr * 0.025));
        var k = 0.6 - 0.52 * x;                 // darkens as it decays: soft hall
        lp += ((rnd() * 2 - 1) - lp) * k;
        d[i] = lp * env;
      }
    }
    return buf;
  }

  function mkBus(revSend, vol) {
    var g = gain(vol), s = gain(revSend);
    g.connect(N.dry); g.connect(s); s.connect(N.revIn);
    return g;
  }

  /* iOS/Android: route WebAudio as media (ignores the silent switch) and keep the context alive */
  var kickEl = null;
  function mobileKick() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    try {
      if (!kickEl) {
        var n = 800, rate = 8000, buf = new ArrayBuffer(44 + n), v = new DataView(buf), i;
        var w = function (o, t) { for (var k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
        v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
        v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
        for (i = 0; i < n; i++) v.setUint8(44 + i, 128);
        kickEl = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
        kickEl.loop = true; kickEl.setAttribute('playsinline', ''); kickEl.volume = 0.01;
      }
      var pr = kickEl.play(); if (pr && pr.catch) pr.catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
    try {
      if (ctx) {
        var b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
        src.buffer = b; src.connect(ctx.destination); src.start(0);
      }
    } catch (e) { /* ignore */ }
  }
  function revive() {
    if (!ctx || !unlocked) return;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    if (kickEl && kickEl.paused) { try { var q = kickEl.play(); if (q && q.catch) q.catch(function () { /* ignore */ }); } catch (e) { /* ignore */ } }
  }

  function build() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC({ latencyHint: 'playback' }); } catch (e) { ctx = new AC(); }

    N.dry = gain(1);
    N.lp = filt('lowpass', 8500, 0.5);
    N.comp = ctx.createDynamicsCompressor();
    N.comp.threshold.value = -20; N.comp.knee.value = 24; N.comp.ratio.value = 3.5;
    N.comp.attack.value = 0.03; N.comp.release.value = 0.35;
    N.master = gain(0);
    link(N.dry, N.lp, N.comp, N.master, ctx.destination);

    N.revIn = filt('highpass', 160, 0.5);
    N.conv = ctx.createConvolver();
    N.conv.buffer = makeImpulse(3.2);
    N.revOut = gain(0.85);
    link(N.revIn, N.conv, N.revOut, N.lp);

    N.musicBus = mkBus(0.6, 0);
    N.ambBus = mkBus(0.14, 1);
    N.sfxBus = mkBus(0.35, 0.9);

    makeNoise();

    for (var i = 0; i < AMB_IDS.length; i++) {
      var g = gain(0); g.connect(N.ambBus);
      amb[AMB_IDS[i]] = { id: AMB_IDS[i], bus: g, gen: null, stopTimer: null };
    }

    unlocked = true;
    applyMaster(0.05);
    applyMusicVol(0.05);
    applyAll(0.6);
    if (wantMusic) startTrack(st.track);

    tickTimer = setInterval(tick, TICK_MS);
    try {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) revive();
      });
      ['touchend', 'pointerdown', 'click'].forEach(function (ev) { document.addEventListener(ev, revive, { passive: true }); });
      ctx.onstatechange = function () { if (ctx.state !== 'running' && !document.hidden) revive(); };
    } catch (e) { /* ignore */ }
    return true;
  }

  function applyMaster(tc) { if (ctx) ramp(N.master.gain, st.muted ? 0 : Math.pow(st.master, 1.5) * 0.9, tc || 0.15); }
  function applyMusicVol(tc) { if (ctx) ramp(N.musicBus.gain, st.musicVol * st.musicVol * 1.1, tc || 0.15); }

  /* ------------------------------------------------------------------ */
  /* scheduler                                                           */
  /* ------------------------------------------------------------------ */

  function tick() {
    if (!ctx || document.hidden || ctx.state !== 'running') return;
    var now = ctx.currentTime, until = now + LOOK;
    try { if (curTrack) trackTick(curTrack, now, until); } catch (e) { /* keep going */ }
    for (var i = 0; i < AMB_IDS.length; i++) {
      var a = amb[AMB_IDS[i]];
      if (a.gen && a.gen.tick) { try { a.gen.tick(now, until); } catch (e2) { /* keep going */ } }
    }
  }

  /* ------------------------------------------------------------------ */
  /* melody + chord helpers shared by the music generators               */
  /* ------------------------------------------------------------------ */

  function Melody(pcs, lo, hi) {
    var sc = [];
    for (var m = lo; m <= hi; m++) if (pcs.indexOf(m % 12) >= 0) sc.push(m);
    return { sc: sc, i: (sc.length / 2) | 0 };
  }
  function melStep(M) {
    var r = rnd(), s;
    if (r < 0.15) s = 0; else if (r < 0.75) s = 1; else if (r < 0.95) s = 2; else s = 3;
    var mid = M.sc.length * 0.5;
    var up = M.i < mid - 3 ? 0.7 : (M.i > mid + 3 ? 0.3 : 0.5);
    if (s) s *= (rnd() < up ? 1 : -1);
    return s;
  }
  function melMove(M, s) { M.i = clamp(M.i + s, 0, M.sc.length - 1); return M.sc[M.i]; }
  function melSnap(M, cpcs) {
    var best = M.i, bd = 999;
    for (var j = 0; j < M.sc.length; j++) {
      if (cpcs.indexOf(M.sc[j] % 12) >= 0) {
        var d = Math.abs(j - M.i);
        if (d < bd) { bd = d; best = j; }
      }
    }
    M.i = best; return M.sc[best];
  }

  /* ------------------------------------------------------------------ */
  /* instrument voices                                                   */
  /* ------------------------------------------------------------------ */

  // felt piano: detuned partials, soft attack, brightness that decays, hammer noise
  function pianoNote(out, t, m, vel) {
    var f = mtof(m), tau = clamp(2.3 - (m - 48) * 0.022, 0.6, 2.4), end = t + tau * 5.5 + 0.3;
    var env = gain(0), lp = filt('lowpass', clamp(f * 7, 900, 4200), 0.4);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * 0.17, t + 0.012);
    env.gain.setTargetAtTime(0, t + 0.012, tau);
    lp.frequency.setValueAtTime(clamp(f * 7, 900, 4200), t);
    lp.frequency.setTargetAtTime(clamp(f * 2.2, 400, 1500), t + 0.01, tau * 0.45);
    var parts = [[1, 1, 0], [2, 0.32, 3], [3, 0.1, -4], [4, 0.04, 5]], last = null;
    for (var i = 0; i < parts.length; i++) {
      var o = osc('sine', f * parts[i][0]); o.detune.value = parts[i][2];
      var g = gain(parts[i][1]);
      link(o, g, env); o.start(t); o.stop(end); last = o;
    }
    var o2 = osc('triangle', f); o2.detune.value = 6;
    var g2 = gain(0.18); link(o2, g2, env); o2.start(t); o2.stop(end);
    link(env, lp, out);
    last.onended = function () { disc(env, lp); };
    burst(out, t, noise.white, 0.06, 'bandpass', 1400, 0.8, vel * 0.025, 0.012, 0);
  }

  // music box / celesta: pure sine bell with a faint upper partial
  function boxNote(out, t, m, vel) {
    var f = mtof(m), tau = 0.9, end = t + tau * 5.5;
    var env = gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * 0.14, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.004, tau);
    var parts = [[1, 1], [3, 0.14], [5.4, 0.05]], last = null;
    for (var i = 0; i < parts.length; i++) {
      var o = osc('sine', f * parts[i][0]), g = gain(parts[i][1]);
      link(o, g, env); o.start(t); o.stop(end); last = o;
    }
    link(env, out);
    last.onended = function () { disc(env); };
  }

  // Karplus-Strong nylon pluck rendered into an AudioBuffer (cached)
  function ks(m) {
    if (ksCache[m]) return ksCache[m];
    var sr = ctx.sampleRate, f = mtof(m);
    var n = Math.max(2, Math.floor(sr / f - 0.5)), actual = sr / (n + 0.5);
    var len = Math.floor(sr * 3.4), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var line = new Float32Array(n), lp = 0, mean = 0, i;
    for (i = 0; i < n; i++) { lp += ((rnd() * 2 - 1) - lp) * 0.55; line[i] = lp; mean += lp; }
    mean /= n;
    for (i = 0; i < n; i++) line[i] -= mean;
    var decay = Math.pow(0.001, 1 / (f * 3.2)), idx = 0, peak = 0.0001;
    for (i = 0; i < len; i++) {
      var nx = idx + 1 === n ? 0 : idx + 1, y = line[idx];
      d[i] = y; line[idx] = decay * 0.5 * (y + line[nx]); idx = nx;
      var a = y < 0 ? -y : y; if (a > peak) peak = a;
    }
    var sc = 0.9 / peak, tail = Math.floor(sr * 0.3);
    for (i = 0; i < len; i++) {
      var k = i > len - tail ? (len - i) / tail : 1;
      d[i] *= sc * k;
    }
    var rec = { buf: buf, rate: f / actual };
    ksCache[m] = rec;
    return rec;
  }
  function pluck(out, t, m, vel) {
    var k = ks(m), s = ctx.createBufferSource(), g = gain(vel * 0.5);
    s.buffer = k.buf; s.playbackRate.value = k.rate;
    link(s, g, out); s.start(t);
    onEnd(s, [g]);
  }

  /* ------------------------------------------------------------------ */
  /* music generators: each returns { bar(tr, t0) -> bar length }        */
  /* they push events {t, f} on tr.q; tick dispatches within lookahead   */
  /* ------------------------------------------------------------------ */

  function ev(tr, t, fn) { tr.q.push({ t: t, f: fn }); }

  function chordInfo(c) {
    var pc = c[0], iv = c[1];
    return {
      pc: pc, iv: iv,
      bass: 36 + pc, base: 48 + pc,
      tones: iv.map(function (i) { return 48 + pc + i; }),
      pcs: iv.map(function (i) { return (pc + i) % 12; })
    };
  }
  function nextProg(cur, n) { return (cur + 1 + ((rnd() * (n - 1)) | 0)) % n; }

  function pianoGen(tr) {
    // F lydian / major colours. [pitch class, intervals]
    var progs = [
      [[5, [0, 4, 7, 11]], [0, [0, 4, 7, 14]], [9, [0, 3, 7, 10]], [10, [0, 4, 7, 11]]],
      [[5, [0, 4, 7, 11]], [2, [0, 3, 7, 10]], [10, [0, 4, 7, 11]], [0, [0, 4, 7, 14]]],
      [[10, [0, 4, 7, 11]], [5, [0, 4, 7, 11]], [7, [0, 3, 7, 10]], [0, [0, 5, 7, 14]]],
      [[5, [0, 4, 7, 14]], [10, [0, 4, 7, 11]], [9, [0, 3, 7, 10]], [7, [0, 3, 7, 10]]]
    ];
    var lhPats = [
      [[0, 'b'], [1, 0], [2, 1], [3, 2]],
      [[0, 'b'], [1.5, 1], [2.5, 2]],
      [[0, 'b'], [2, 0], [3, 1]],
      [[0, 'b5'], [2, 1]]
    ];
    var rhTempl = [[0], [0, 1.5, 2.5], [1, 2], [0.5, 2, 3], [2], [0, 2], [1, 2.5, 3]];
    var M = Melody([5, 7, 9, 10, 0, 2, 4], 64, 86), pi = 0, ci = 0, motif = null, beat0 = 60 / 58;
    tr.in = tr.bus;

    return {
      bar: function (t0) {
        var prog = progs[pi], c = chordInfo(prog[ci]);
        var b = beat0 * R(0.97, 1.05), len = b * 4, lastBar = ci === prog.length - 1;
        var silent = ci === 0 && rnd() < 0.12;
        var i, p, m, vel, out = tr.in;
        if (!silent) {
          // left hand, sparse broken chord
          var pat = pick(lhPats);
          for (i = 0; i < pat.length; i++) {
            if (i > 0 && rnd() < 0.22) continue;
            p = pat[i];
            if (p[1] === 'b') m = c.bass; else if (p[1] === 'b5') m = c.bass + 7; else m = c.tones[p[1] % c.tones.length];
            vel = (p[1] === 'b' ? 0.55 : 0.4) * R(0.8, 1.1);
            (function (tt, mm, vv) { ev(tr, tt, function (x) { pianoNote(out, x, mm, vv); }); })(t0 + p[0] * b + R(-0.02, 0.025), m, vel);
            if (p[1] === 'b' && rnd() < 0.3) {
              (function (tt, mm, vv) { ev(tr, tt, function (x) { pianoNote(out, x, mm, vv); }); })(t0 + R(0.0, 0.03), c.bass + 12, 0.25);
            }
          }
          // right hand melody
          if (rnd() < 0.78) {
            var tm = pick(rhTempl), steps;
            if (motif && rnd() < 0.4) { tm = pick(rhTempl.filter(function (x) { return x.length === motif.length; })) || tm; }
            if (motif && motif.length === tm.length && rnd() < 0.7) steps = motif;
            else { steps = []; for (i = 0; i < tm.length; i++) steps.push(melStep(M)); }
            motif = steps;
            for (i = 0; i < tm.length; i++) {
              m = melMove(M, steps[i]);
              var isLast = i === tm.length - 1;
              if (isLast && (lastBar || rnd() < 0.3)) m = melSnap(M, c.pcs);
              vel = (isLast && lastBar ? 0.38 : 0.5) * R(0.8, 1.15);
              (function (tt, mm, vv) { ev(tr, tt, function (x) { pianoNote(out, x, mm, vv); }); })(t0 + tm[i] * b + R(-0.03, 0.04), m, vel);
            }
          }
        }
        ci++;
        if (ci >= prog.length) { ci = 0; pi = nextProg(pi, progs.length); }
        return len;
      }
    };
  }

  function guitarGen(tr) {
    var progs = [
      [[0, [0, 4, 7, 11]], [9, [0, 3, 7, 10]], [5, [0, 4, 7, 11]], [7, [0, 4, 7, 9]]],
      [[9, [0, 3, 7, 10]], [5, [0, 4, 7, 11]], [0, [0, 4, 7, 14]], [7, [0, 4, 7, 9]]],
      [[0, [0, 4, 7, 14]], [4, [0, 3, 7, 10]], [5, [0, 4, 7, 11]], [0, [0, 4, 7, 11]]],
      [[2, [0, 3, 7, 10]], [7, [0, 4, 7, 9]], [0, [0, 4, 7, 11]], [9, [0, 3, 7, 10]]]
    ];
    var pats = [
      [0, 2, 3, 4, 3, 2, 3, 1],
      [0, 3, 2, 4, 2, 3, 1, 2],
      [0, 2, 4, 3, 4, 2, 3, 2],
      [0, -1, 3, 4, 3, -1, 2, 3]
    ];
    var M = Melody([0, 2, 4, 7, 9], 69, 84), pi = 0, ci = 0, eighth0 = 60 / 66 / 2;
    var lp = filt('lowpass', 3400, 0.5);
    link(lp, tr.bus);
    tr.in = lp;
    tr.extra = [lp];

    return {
      bar: function (t0) {
        var prog = progs[pi], ch = prog[ci], pc = ch[0], iv = ch[1];
        var bass = 40 + ((pc - 4 + 12) % 12);
        var a = iv[1], b = iv[2], cc = iv[3];
        var voicing = [bass, bass + b, bass + cc, bass + 12 + a, bass + 12 + b];
        var e8 = eighth0 * R(0.98, 1.04), len = e8 * 8, out = tr.in;
        var pat = pick(pats), i, vel;
        for (i = 0; i < 8; i++) {
          var si = pat[i];
          if (si < 0) continue;
          if (i > 0 && rnd() < 0.08) continue;
          vel = (i === 0 ? 0.85 : (i % 2 === 0 ? 0.65 : 0.5)) * R(0.85, 1.1);
          (function (tt, mm, vv) { ev(tr, tt, function (x) { pluck(out, x, mm, vv); }); })(t0 + i * e8 + R(-0.012, 0.012), voicing[si], vel);
        }
        if (rnd() < 0.3) {
          var cpcs = iv.map(function (x) { return (pc + x) % 12; });
          var mm = melSnap(M, cpcs), pos = 5 + ((rnd() * 3) | 0);
          (function (tt, mmm) { ev(tr, tt, function (x) { pluck(out, x, mmm, 0.55); }); })(t0 + pos * e8 + R(0, 0.02), mm);
        }
        ci++;
        if (ci >= prog.length) { ci = 0; pi = nextProg(pi, progs.length); }
        return len;
      }
    };
  }

  function instrumentalGen(tr) {
    // D major: slow pad + music-box melody
    var progs = [
      [[2, [0, 4, 7, 11]], [11, [0, 3, 7, 10]], [7, [0, 4, 7, 11]], [9, [0, 4, 7, 14]]],
      [[7, [0, 4, 7, 11]], [2, [0, 4, 7, 14]], [4, [0, 3, 7, 10]], [9, [0, 4, 7, 14]]],
      [[2, [0, 4, 7, 14]], [7, [0, 4, 7, 11]], [11, [0, 3, 7, 10]], [4, [0, 3, 7, 10]]]
    ];
    var M = Melody([2, 4, 6, 9, 11], 72, 91), pi = 0, ci = 0, beat0 = 60 / 52;
    tr.in = tr.bus;

    function padChord(t, c, len) {
      var out = tr.in, lp = filt('lowpass', 500, 0.3), end = t + len + 3;
      lp.frequency.setValueAtTime(450, t);
      lp.frequency.linearRampToValueAtTime(1100, t + len * 0.5);
      lp.frequency.linearRampToValueAtTime(450, t + len + 2.5);
      link(lp, out);
      var bass = 38 + ((c.pc - 2 + 12) % 12);
      var base = 55 + ((c.pc - 7 + 12) % 12);
      var notes = [bass, bass + 12, base + c.iv[1], base + c.iv[2], base + c.iv[3]];
      var lastO = null;
      for (var i = 0; i < notes.length; i++) {
        var f = mtof(notes[i]), env = gain(0), mix = gain(1);
        var o1 = osc('triangle', f), o2 = osc('sawtooth', f), g2 = gain(0.28);
        o2.detune.value = R(-7, 7);
        var pk = i < 2 ? 0.05 : 0.036;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(pk, t + 2.4);
        env.gain.setValueAtTime(pk, t + len - 0.2);
        env.gain.linearRampToValueAtTime(0, t + len + 2.5);
        o1.connect(mix); o2.connect(g2); g2.connect(mix); mix.connect(env); env.connect(lp);
        o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
        lastO = o2;
      }
      lastO.onended = function () { disc(lp); };
    }

    return {
      bar: function (t0) {
        var prog = progs[pi], c = chordInfo(prog[ci]);
        var b = beat0 * R(0.98, 1.04), len = b * 8, out = tr.in;
        var lastBar = ci === prog.length - 1;
        ev(tr, t0, function (x) { padChord(x, c, len); });
        if (rnd() < 0.88) {
          var p = pick([0, 0, 1, 2]), count = 0, first = true;
          while (p < 7.5 && count < 5) {
            var m = melMove(M, melStep(M));
            if ((first && rnd() < 0.6) || (lastBar && p + 2 > 7.5)) m = melSnap(M, c.pcs);
            first = false;
            (function (tt, mm, vv) { ev(tr, tt, function (x) { boxNote(out, x, mm, vv); }); })(t0 + p * b + R(-0.02, 0.03), m, R(0.45, 0.8));
            count++;
            p += pick([1, 1, 2, 2, 3]);
          }
        }
        ci++;
        if (ci >= prog.length) { ci = 0; pi = nextProg(pi, progs.length); }
        return len;
      }
    };
  }

  var TRACK_GEN = { piano: pianoGen, guitar: guitarGen, instrumental: instrumentalGen };

  function startTrack(id) {
    if (!ctx) return;
    if (curTrack && curTrack.id === id && curTrack.alive) return;
    if (curTrack) stopTrack(curTrack);
    var tr = { id: id, bus: gain(0), q: [], next: ctx.currentTime + 0.4, alive: true, in: null, extra: null };
    tr.bus.connect(N.musicBus);
    tr.gen = TRACK_GEN[id](tr);
    ramp(tr.bus.gain, 1, 1.0);
    curTrack = tr;
  }
  function stopTrack(tr) {
    tr.alive = false;
    tr.q.length = 0;
    ramp(tr.bus.gain, 0, 0.7);
    setTimeout(function () { disc(tr.bus); if (tr.extra) disc.apply(null, tr.extra); }, 6000);
    if (curTrack === tr) curTrack = null;
  }
  function trackTick(tr, now, until) {
    if (!tr.alive) return;
    if (tr.next < now - 0.5) { tr.q.length = 0; tr.next = now + 0.2; }   // woke from a hidden tab
    var guard = 0;
    while (tr.next < now + 2.0 && guard++ < 3) {
      tr.next += tr.gen.bar(tr.next);
      tr.q.sort(function (a, b) { return a.t - b.t; });
    }
    while (tr.q.length && tr.q[0].t < until) {
      var e = tr.q.shift();
      if (e.t < now - 0.2) continue;
      e.f(Math.max(e.t, now + 0.005));
    }
  }

  /* ------------------------------------------------------------------ */
  /* ambient generators: GEN[id](out) -> { tick(now, until), stop() }   */
  /* ------------------------------------------------------------------ */

  var SONGS = [
    function () { // chirps
      var f = R(2600, 3400), n = [], c = 2 + ((rnd() * 3) | 0);
      for (var i = 0; i < c; i++) n.push({ at: i * 0.11, f0: f, f1: f * 1.25, d: 0.08 });
      return n;
    },
    function () { // trill
      var f = R(3000, 4200), c = 8 + ((rnd() * 8) | 0), n = [];
      for (var i = 0; i < c; i++) { var up = i % 2; n.push({ at: i * 0.05, f0: up ? f * 1.15 : f, f1: up ? f : f * 1.15, d: 0.045 }); }
      return n;
    },
    function () { // two-note call
      var f = R(1900, 2500);
      return [{ at: 0, f0: f, f1: f * 1.12, d: 0.28 }, { at: 0.42, f0: f * 0.82, f1: f * 0.78, d: 0.38 }];
    },
    function () { // descending warble
      var f = R(3200, 3900), n = [], c = 4 + ((rnd() * 3) | 0);
      for (var i = 0; i < c; i++) n.push({ at: i * 0.13, f0: f * Math.pow(0.93, i), f1: f * Math.pow(0.93, i) * 0.95, d: 0.1 });
      return n;
    },
    function () { // rising whistle phrase
      var f = R(2000, 2600);
      return [{ at: 0, f0: f, f1: f * 1.3, d: 0.15 }, { at: 0.2, f0: f * 1.3, f1: f * 1.5, d: 0.12 }, { at: 0.38, f0: f * 1.5, f1: f * 1.1, d: 0.2 }];
    }
  ];

  // one oscillator plays a whole song: frequency glides + gain envelope per note
  function voiceSong(out, t, notes, mul, vol, pan, vibHz) {
    var o = osc('sine', notes[0].f0 * mul), g = gain(0), p = panner(pan), end = t, lfo = null, lg = null;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i], s = t + n.at, a = n.a || Math.min(0.012, n.d * 0.3);
      o.frequency.setValueAtTime(n.f0 * mul, s);
      o.frequency.exponentialRampToValueAtTime(n.f1 * mul, s + n.d);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol * (n.v || 1), s + a);
      g.gain.linearRampToValueAtTime(0, s + n.d);
      end = s + n.d;
    }
    if (vibHz) {
      lfo = osc('sine', vibHz); lg = gain(30 * mul);
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(end + 0.05);
    }
    link(o, g, p, out);
    o.start(t); o.stop(end + 0.05);
    onEnd(o, [g, p, lg]);
  }
  function birdSong(out, t, mul, vol) {
    var idx = (rnd() * SONGS.length) | 0;
    voiceSong(out, t, SONGS[idx](), mul, vol, R(-0.9, 0.9), idx === 3 ? 28 : 0);
  }

  var GEN = {};

  GEN.rain = function (out) {
    var gg = gain(1), srcs = [];
    gg.connect(out);
    var s1 = loopSrc(noise.pink), hp = filt('highpass', 600, 0.5), lp = filt('lowpass', 7000, 0.5), g1 = gain(0.3);
    link(s1, hp, lp, g1, gg);
    var s2 = loopSrc(noise.brown), lp2 = filt('lowpass', 500, 0.5), g2 = gain(0.16);
    link(s2, lp2, g2, gg);
    var lfo = osc('sine', 0.05), lg = gain(0.05);
    lfo.connect(lg); lg.connect(g1.gain); lfo.start();
    srcs.push(s1, s2, lfo);
    var nextDrop = ctx.currentTime, nextThunder = ctx.currentTime + R(50, 130);

    function drop(t) {
      var o = osc('sine', R(1500, 4500)), g = gain(0), p = panner(R(-1, 1));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(R(0.01, 0.045), t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.002, 0.008);
      link(o, g, p, gg);
      o.start(t); o.stop(t + 0.08);
      onEnd(o, [g, p]);
    }
    function thunder(t) {
      var s = shotSrc(noise.brown, t, 10), lpf = filt('lowpass', 300, 0.5), g = gain(0);
      lpf.frequency.setValueAtTime(300, t);
      lpf.frequency.setTargetAtTime(90, t, 3);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 1.3);
      g.gain.setTargetAtTime(0, t + 1.3, 2.2);
      link(s, lpf, g, gg);
      onEnd(s, [lpf, g]);
    }
    return {
      tick: function (now, until) {
        if (nextDrop < now) nextDrop = now;
        while (nextDrop < until) { drop(nextDrop); nextDrop += -Math.log(1 - rnd()) / R(8, 20); }
        if (nextThunder < now - 1) nextThunder = now + R(40, 100);
        if (nextThunder < until) { thunder(Math.max(nextThunder, now + 0.02)); nextThunder = until + R(80, 200); }
      },
      stop: function () { stopAll(srcs, gg); }
    };
  };

  GEN.birds = function (out) {
    var gg = gain(1), next = ctx.currentTime + R(0.2, 1.5);
    gg.connect(out);
    return {
      tick: function (now, until) {
        if (next < now - 1) next = now + 0.2;
        if (next < until) {
          var t = Math.max(next, now + 0.01);
          birdSong(gg, t, 1, R(0.1, 0.2));
          if (rnd() < 0.3) birdSong(gg, t + R(0.5, 1.6), R(0.85, 1.15), R(0.07, 0.15));
          next = t + R(1.3, 6.5);
        }
      },
      stop: function () { disc(gg); }
    };
  };

  GEN.forest = function (out) {
    var gg = gain(1), srcs = [];
    gg.connect(out);
    var s1 = loopSrc(noise.pink), bp = filt('bandpass', 3000, 0.4), g1 = gain(0.06);
    link(s1, bp, g1, gg);
    var s2 = loopSrc(noise.brown), lp = filt('lowpass', 250, 0.5), g2 = gain(0.08);
    link(s2, lp, g2, gg);
    srcs.push(s1, s2);
    var T = ctx.currentTime;
    var nextGust = T, nextBird = T + R(0.5, 3), nextWood = T + R(25, 70), nextCuckoo = T + R(20, 60);

    return {
      tick: function (now, until) {
        if (nextGust < now) {
          g1.gain.setTargetAtTime(R(0.03, 0.14), now + 0.01, 1.2);
          g2.gain.setTargetAtTime(R(0.05, 0.11), now + 0.01, 2);
          nextGust = now + R(2, 5);
        }
        if (nextBird < now - 1) nextBird = now + 0.3;
        if (nextBird < until) {
          var t = Math.max(nextBird, now + 0.01);
          birdSong(gg, t, rnd() < 0.8 ? R(0.55, 0.75) : 1, R(0.07, 0.14));
          nextBird = t + R(2.5, 9);
        }
        if (nextWood < now - 1) nextWood = now + R(20, 50);
        if (nextWood < until) {
          var w = Math.max(nextWood, now + 0.01), c = 5 + ((rnd() * 5) | 0), pan = R(-1, 1), at = 0;
          for (var i = 0; i < c; i++) {
            burst(gg, w + at, noise.white, 0.05, 'bandpass', 1100, 3, 0.3 * (1 - i * 0.04), 0.012, pan * 0.8);
            at += 0.095 - i * 0.002;
          }
          nextWood = w + R(40, 110);
        }
        if (nextCuckoo < now - 1) nextCuckoo = now + R(20, 40);
        if (nextCuckoo < until) {
          var q = Math.max(nextCuckoo, now + 0.01), notes = [], reps = 2 + ((rnd() * 2) | 0);
          for (var j = 0; j < reps; j++) {
            notes.push({ at: j * 0.9, f0: 700, f1: 690, d: 0.2, a: 0.04 });
            notes.push({ at: j * 0.9 + 0.3, f0: 560, f1: 550, d: 0.32, a: 0.05 });
          }
          voiceSong(gg, q, notes, 1, 0.09, R(-0.9, 0.9), 0);
          nextCuckoo = q + R(30, 90);
        }
      },
      stop: function () { stopAll(srcs, gg); }
    };
  };

  GEN.fire = function (out) {
    var gg = gain(1), srcs = [];
    gg.connect(out);
    var s1 = loopSrc(noise.brown), lp = filt('lowpass', 450, 0.5), g1 = gain(0.55);
    link(s1, lp, g1, gg);
    var s2 = loopSrc(noise.pink), hp = filt('highpass', 2000, 0.5), lp2 = filt('lowpass', 6000, 0.5), g2 = gain(0.025);
    link(s2, hp, lp2, g2, gg);
    var lfo = osc('sine', 0.27), lg = gain(0.1);
    lfo.connect(lg); lg.connect(g1.gain); lfo.start();
    srcs.push(s1, s2, lfo);
    var next = ctx.currentTime, nextWaver = ctx.currentTime;

    function crackle(t) {
      var big = rnd() < 0.08;
      if (big) burst(gg, t, noise.white, 0.1, 'bandpass', R(500, 900), 2, R(0.3, 0.5), 0.02, R(-0.5, 0.5));
      else burst(gg, t, noise.white, 0.07, 'bandpass', R(1200, 5500), R(0.8, 3), R(0.05, 0.35), R(0.004, 0.015), R(-0.5, 0.5));
    }
    return {
      tick: function (now, until) {
        if (nextWaver < now) {
          g1.gain.setTargetAtTime(R(0.38, 0.62), now + 0.01, 0.6);
          g2.gain.setTargetAtTime(R(0.015, 0.04), now + 0.01, 0.5);
          nextWaver = now + R(1.5, 4);
        }
        if (next < now) next = now;
        while (next < until) {
          crackle(next);
          next += -Math.log(1 - rnd()) / R(3, 9);
        }
      },
      stop: function () { stopAll(srcs, gg); }
    };
  };

  GEN.ocean = function (out) {
    var gg = gain(1), srcs = [];
    gg.connect(out);
    var s1 = loopSrc(noise.pink), lp = filt('lowpass', 400, 0.5), wg = gain(0.05);
    link(s1, lp, wg, gg);
    var s2 = loopSrc(noise.white), hp = filt('highpass', 2500, 0.5), lp2 = filt('lowpass', 9000, 0.5), fg = gain(0);
    link(s2, hp, lp2, fg, gg);
    var s3 = loopSrc(noise.brown), lp3 = filt('lowpass', 220, 0.5), g3 = gain(0.1);
    link(s3, lp3, g3, gg);
    srcs.push(s1, s2, s3);
    var nextWave = ctx.currentTime + 0.1;

    function wave(t) {
      var T = R(8, 12);
      wg.gain.setTargetAtTime(0.7, t, T * 0.17);
      wg.gain.setTargetAtTime(0.08, t + T * 0.5, T * 0.14);
      lp.frequency.setTargetAtTime(1600, t, T * 0.2);
      lp.frequency.setTargetAtTime(350, t + T * 0.5, T * 0.15);
      fg.gain.setTargetAtTime(0.2, t + T * 0.5, 0.35);
      fg.gain.setTargetAtTime(0, t + T * 0.5 + 0.9, T * 0.2);
      return T;
    }
    return {
      tick: function (now, until) {
        if (nextWave < now - 1) nextWave = now + 0.1;
        if (nextWave < until) nextWave += wave(Math.max(nextWave, now + 0.01));
      },
      stop: function () { stopAll(srcs, gg); }
    };
  };

  GEN.wind = function (out) {
    var gg = gain(1), srcs = [];
    gg.connect(out);
    var s1 = loopSrc(noise.pink), bp = filt('bandpass', 450, 0.8), wgn = gain(0.3);
    link(s1, bp, wgn, gg);
    var s2 = loopSrc(noise.white), bp2 = filt('bandpass', 1400, 5), g2 = gain(0.012);
    link(s2, bp2, g2, gg);
    srcs.push(s1, s2);
    var T = ctx.currentTime, nextWander = T, nextGust = T;
    return {
      tick: function (now) {
        if (nextWander < now) {
          bp.frequency.setTargetAtTime(R(250, 800), now + 0.01, 1.8);
          bp2.frequency.setTargetAtTime(R(900, 2200), now + 0.01, 2.5);
          nextWander = now + R(2.5, 5);
        }
        if (nextGust < now) {
          wgn.gain.setTargetAtTime(R(0.15, 0.7), now + 0.01, R(1, 2.5));
          g2.gain.setTargetAtTime(R(0.005, 0.03), now + 0.01, R(1, 2.5));
          nextGust = now + R(3, 8);
        }
      },
      stop: function () { stopAll(srcs, gg); }
    };
  };

  GEN.night = function (out) {
    var gg = gain(1), srcs = [];
    gg.connect(out);
    var s1 = loopSrc(noise.brown), lp = filt('lowpass', 250, 0.5), g1 = gain(0.04);
    link(s1, lp, g1, gg);
    srcs.push(s1);
    var T = ctx.currentTime, crickets = [], i;
    for (i = 0; i < 4; i++) {
      crickets.push({ f: R(3800, 4700), pan: R(-0.8, 0.8), next: T + R(0, 2), on: true, until: T + R(4, 10) });
    }
    var nextOwl = T + R(25, 70);

    function chirp(c, t) {
      var o = osc('sine', c.f), g = gain(0), p = panner(c.pan);
      for (var k = 0; k < 3; k++) {
        var s = t + k * 0.06;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.05, s + 0.008);
        g.gain.linearRampToValueAtTime(0, s + 0.04);
      }
      link(o, g, p, gg);
      o.start(t); o.stop(t + 0.2);
      onEnd(o, [g, p]);
    }
    return {
      tick: function (now, until) {
        for (var j = 0; j < crickets.length; j++) {
          var c = crickets[j];
          if (c.next < now - 1) { c.next = now + R(0, 1); c.on = true; c.until = now + R(4, 10); }
          while (c.next < until) {
            if (c.on) {
              if (c.next >= now) chirp(c, c.next);
              c.next += R(0.38, 0.5);
              if (c.next > c.until) { c.on = false; c.next += R(3, 10); }
            } else {
              c.on = true; c.until = c.next + R(6, 14);
            }
          }
        }
        if (nextOwl < now - 1) nextOwl = now + R(20, 50);
        if (nextOwl < until) {
          var t = Math.max(nextOwl, now + 0.01), f = R(330, 400);
          voiceSong(gg, t, [{ at: 0, f0: f, f1: f * 0.95, d: 0.3, a: 0.08 }, { at: 0.5, f0: f * 0.97, f1: f * 0.88, d: 0.55, a: 0.1 }], 1, 0.07, R(-0.9, 0.9), 0);
          nextOwl = t + R(50, 120);
        }
      },
      stop: function () { stopAll(srcs, gg); }
    };
  };

  /* ---- ambient level handling ---- */

  function effLevel(id) {
    if (st.ov[id] !== undefined) return st.ov[id];
    return sceneAmb[id] || 0;
  }
  function applyAmb(id, tc) {
    if (!ctx) return;
    var a = amb[id], lv = effLevel(id), on = lv > 0.001;
    if (on) {
      if (a.stopTimer) { clearTimeout(a.stopTimer); a.stopTimer = null; }
      if (!a.gen) a.gen = GEN[id](a.bus);
    }
    ramp(a.bus.gain, on ? Math.pow(lv, 1.4) : 0, tc);
    if (!on && a.gen && !a.stopTimer) {
      a.stopTimer = setTimeout(function () {
        a.stopTimer = null;
        if (effLevel(id) <= 0.001 && a.gen) { a.gen.stop(); a.gen = null; }
      }, Math.max(4000, tc * 5000 + 500));
    }
  }
  function applyAll(tc) { for (var i = 0; i < AMB_IDS.length; i++) applyAmb(AMB_IDS[i], tc); }

  /* ------------------------------------------------------------------ */
  /* sound effects                                                       */
  /* ------------------------------------------------------------------ */

  var SFX = {
    pour: function (t) {
      var out = N.sfxBus, dur = 2.6, i;
      var s = shotSrc(noise.pink, t, dur), bp = filt('bandpass', 1400, 1.4), g = gain(0);
      bp.frequency.setValueAtTime(1400, t);
      bp.frequency.linearRampToValueAtTime(2600, t + dur * 0.9);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.35);
      g.gain.linearRampToValueAtTime(0.45, t + dur - 0.6);
      g.gain.linearRampToValueAtTime(0, t + dur);
      link(s, bp, g, out); onEnd(s, [bp, g]);
      var s2 = shotSrc(noise.pink, t, dur), lp = filt('lowpass', 700, 0.5), g2 = gain(0);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.35, t + 0.4);
      g2.gain.linearRampToValueAtTime(0, t + dur);
      link(s2, lp, g2, out); onEnd(s2, [lp, g2]);
      for (i = 0; i < 22; i++) {
        var bt = t + 0.25 + i * (dur - 0.6) / 22 + R(0, 0.06), f = 520 + (i / 22) * 900 + R(-60, 60);
        var o = osc('sine', f), bg = gain(0);
        o.frequency.setValueAtTime(f, bt);
        o.frequency.exponentialRampToValueAtTime(f * 1.6, bt + 0.05);
        bg.gain.setValueAtTime(0, bt);
        bg.gain.linearRampToValueAtTime(R(0.02, 0.05), bt + 0.004);
        bg.gain.setTargetAtTime(0, bt + 0.004, 0.02);
        link(o, bg, out); o.start(bt); o.stop(bt + 0.12); onEnd(o, [bg]);
      }
    },
    page: function (t) {
      var out = N.sfxBus, s = shotSrc(noise.white, t, 0.5), bp = filt('bandpass', 3000, 0.7), g = gain(0);
      bp.frequency.setValueAtTime(3000, t);
      bp.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.03);
      g.gain.setTargetAtTime(0, t + 0.03, 0.08);
      g.gain.setTargetAtTime(0.1, t + 0.13, 0.015);
      g.gain.setTargetAtTime(0, t + 0.16, 0.07);
      link(s, bp, g, out); onEnd(s, [bp, g]);
    },
    chime: function (t) {
      var out = N.sfxBus, f = pick([659.25, 783.99, 880, 987.77, 1174.66]);
      var parts = [[1, 1, 1.4], [2.76, 0.32, 0.7], [5.4, 0.12, 0.35], [8.9, 0.04, 0.2]];
      for (var i = 0; i < parts.length; i++) {
        var o = osc('sine', f * parts[i][0]), g = gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(parts[i][1] * 0.16, t + 0.006);
        g.gain.setTargetAtTime(0, t + 0.006, parts[i][2]);
        link(o, g, out); o.start(t); o.stop(t + parts[i][2] * 5 + 0.1); onEnd(o, [g]);
      }
    },
    cup: function (t) {
      var out = N.sfxBus, parts = [[2300, 0.5, 0.07], [3480, 0.25, 0.05], [5200, 0.1, 0.03]];
      for (var i = 0; i < parts.length; i++) {
        var o = osc('sine', parts[i][0] * R(0.99, 1.01)), g = gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(parts[i][1] * 0.2, t + 0.002);
        g.gain.setTargetAtTime(0, t + 0.002, parts[i][2]);
        link(o, g, out); o.start(t); o.stop(t + 0.6); onEnd(o, [g]);
      }
      burst(out, t, noise.white, 0.04, 'bandpass', 3500, 1, 0.1, 0.006, 0);
    },
    purr: function (t) {
      var out = N.sfxBus, dur = 3.3;
      var s = shotSrc(noise.pink, t, dur), bp = filt('bandpass', 140, 1.0), am = gain(0.5), env = gain(0);
      var lfo = osc('sine', 23), lg = gain(0.45);
      lfo.frequency.setValueAtTime(23, t);
      lfo.frequency.linearRampToValueAtTime(27, t + 1.6);
      lfo.frequency.linearRampToValueAtTime(22, t + dur);
      lfo.connect(lg); lg.connect(am.gain);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.9, t + 0.7);
      env.gain.setValueAtTime(0.9, t + 2.3);
      env.gain.linearRampToValueAtTime(0, t + dur);
      link(s, bp, am, env, out);
      lfo.start(t); lfo.stop(t + dur + 0.05);
      onEnd(s, [bp, am, env, lg]);
    },
    'switch': function (t) {
      var out = N.sfxBus;
      burst(out, t, noise.white, 0.03, 'bandpass', 2800, 3, 0.35, 0.004, 0);
      burst(out, t + 0.05, noise.white, 0.03, 'bandpass', 2200, 3, 0.2, 0.005, 0);
      var o = osc('sine', 160), g = gain(0);
      g.gain.setValueAtTime(0, t + 0.048);
      g.gain.linearRampToValueAtTime(0.18, t + 0.05);
      g.gain.setTargetAtTime(0, t + 0.05, 0.02);
      link(o, g, out); o.start(t + 0.048); o.stop(t + 0.2); onEnd(o, [g]);
    },
    water: function (t) {
      var out = N.sfxBus, at = t, c = 4 + ((rnd() * 3) | 0);
      for (var i = 0; i < c; i++) {
        var f = R(700, 1300), o = osc('sine', f), g = gain(0);
        o.frequency.setValueAtTime(f, at);
        o.frequency.exponentialRampToValueAtTime(f * 1.9, at + 0.07);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(R(0.1, 0.16), at + 0.005);
        g.gain.setTargetAtTime(0, at + 0.005, 0.05);
        link(o, g, out); o.start(at); o.stop(at + 0.4); onEnd(o, [g]);
        at += R(0.14, 0.4);
      }
    },
    soft: function (t) {
      pianoNote(N.sfxBus, t, pick([72, 76, 79]), 0.4);
    }
  };

  /* ------------------------------------------------------------------ */
  /* public API                                                          */
  /* ------------------------------------------------------------------ */

  load();

  var audio = {
    musicTracks: TRACKS,
    ambients: AMBIENTS,

    unlock: function () {
      try {
        if (!ctx) {
          if (!build()) return Promise.resolve(false);
        }
        mobileKick();
        var p = (ctx.state !== 'running') ? ctx.resume() : null;
        emit();
        return Promise.resolve(p).then(function () { emit(); return true; }, function () { return false; });
      } catch (e) {
        return Promise.resolve(false);
      }
    },

    playMusic: function (id) {
      if (id && isTrack(id)) st.track = id;
      wantMusic = true;
      save();
      if (ctx) {
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
        startTrack(st.track);
      }
      emit();
    },
    pauseMusic: function () {
      wantMusic = false;
      if (curTrack) stopTrack(curTrack);
      emit();
    },
    toggleMusic: function () {
      if (wantMusic) audio.pauseMusic(); else audio.playMusic();
    },
    setMusicVolume: function (v) {
      st.musicVol = clamp(isNum(v) ? v : 0, 0, 1);
      applyMusicVol(0.15); save(); emit();
    },
    getMusicVolume: function () { return st.musicVol; },

    setSceneAmbience: function (map) {
      sceneAmb = {};
      if (map && typeof map === 'object') {
        for (var i = 0; i < AMB_IDS.length; i++) {
          var v = map[AMB_IDS[i]];
          if (isNum(v)) sceneAmb[AMB_IDS[i]] = clamp(v, 0, 1);
        }
      }
      applyAll(1.0); emit();
    },
    setAmbient: function (id, v) {
      if (AMB_IDS.indexOf(id) < 0) return;
      st.ov[id] = clamp(isNum(v) ? v : 0, 0, 1);
      applyAmb(id, 0.25); save(); emit();
    },
    getAmbient: function (id) { return AMB_IDS.indexOf(id) < 0 ? 0 : effLevel(id); },
    clearOverrides: function () {
      st.ov = {};
      applyAll(1.0); save(); emit();
    },

    setMaster: function (v) {
      st.master = clamp(isNum(v) ? v : 0, 0, 1);
      applyMaster(0.15); save(); emit();
    },
    getMaster: function () { return st.master; },
    setMuted: function (b) {
      st.muted = !!b;
      applyMaster(0.2); save(); emit();
    },

    sfx: function (name) {
      if (!ctx || st.muted || ctx.state !== 'running') return;
      var f = SFX[name];
      if (!f) return;
      try { f(ctx.currentTime + 0.01); } catch (e) { /* never break the page for a sound */ }
    }
  };

  Object.defineProperty(audio, 'enabled', { enumerable: true, get: function () { return unlocked && !st.muted; } });
  Object.defineProperty(audio, 'muted', { enumerable: true, get: function () { return st.muted; } });
  Object.defineProperty(audio, 'music', { enumerable: true, get: function () { return { id: st.track, playing: wantMusic }; } });

  Peace.audio = audio;
})();
