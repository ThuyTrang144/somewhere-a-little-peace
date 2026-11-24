/* Somewhere, A Little Peace - ui.js
   Opening, interface, Sound shelf, Map, Journal, Breathe, Let go, kind note, idle fade. Loads last. */
(function () {
  'use strict';

  var P = window.Peace;
  if (!P) { return; }
  var W = window, D = document, html = D.documentElement;
  var TIMES = ['day', 'dusk', 'night'];

  function $(id) { return D.getElementById(id); }
  function noop() {}
  function audio(name) {
    try {
      var a = P.audio;
      if (a && typeof a[name] === 'function') {
        var r = a[name].apply(a, Array.prototype.slice.call(arguments, 1));
        if (r && typeof r.then === 'function') r.then(null, noop);
        return r;
      }
    } catch (e) { /* sound is optional */ }
    return undefined;
  }
  function h(tag, attrs, kids) {
    var e = D.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null) continue;
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (kids) for (var i = 0; i < kids.length; i++) e.appendChild(kids[i]);
    return e;
  }

  var els = {};
  var openName = null, lastOpener = null, pendingFinish = null, closeT = 0;
  var panels = {};
  var idleT = 0, lastBump = 0;
  var breathing = false, bthTimers = [];
  var soundChoice = true, entering = false;

  /* ================================================================ panels */
  function openPanel(name, opener) {
    var p = panels[name];
    if (!p) return;
    if (openName === name) { closePanel(); return; }
    if (pendingFinish) { W.clearTimeout(closeT); pendingFinish(); }
    if (openName) closePanel(true);
    if (breathing) stopBreathe(true);
    lastOpener = opener || D.activeElement;
    if (p.onOpen) p.onOpen();
    var dlg = p.el;
    dlg.classList.remove('is-closing');
    openName = name;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    var f = dlg.querySelector('[data-autofocus]') || dlg.querySelector('.sheet-x');
    if (name === 'sound') f = dlg.querySelector('.sh-play') || f;
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    bump();
  }

  function closePanel(instant) {
    if (!openName) return;
    var dlg = panels[openName].el;
    openName = null;
    var opener = lastOpener;
    var fin = function () {
      pendingFinish = null;
      dlg.classList.remove('is-closing');
      if (dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } }
      if (opener && opener.focus && D.contains(opener) && !opener.disabled && !P.state.busy) {
        try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    };
    if (instant || P.state.reducedMotion) { fin(); return; }
    dlg.classList.add('is-closing');
    pendingFinish = fin;
    closeT = W.setTimeout(fin, 300);
  }

  function bindPanels() {
    var names = { sound: 'panel-sound', map: 'panel-map', journal: 'panel-journal', letgo: 'panel-letgo', more: 'panel-more' };
    Object.keys(names).forEach(function (k) {
      var el = $(names[k]);
      if (!el) return;
      panels[k] = { el: el };
      el.addEventListener('cancel', function (e) { e.preventDefault(); closePanel(); });
      el.addEventListener('click', function (e) { if (e.target === el) closePanel(); });
      el.addEventListener('close', function () { if (openName === k) openName = null; });
    });
    panels.sound.onOpen = buildShelf;
    panels.map.onOpen = buildMap;
    panels.journal.onOpen = journalOpen;
    panels.letgo.onOpen = function () { var i = $('lg-input'); if (i) i.value = ''; };
    panels.more.onOpen = buildMore;
    D.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-close]')) closePanel();
    });
  }

  /* ================================================================ sound */
  function wake() {
    var a = P.audio;
    if (a && !a.enabled && !a.muted && typeof a.unlock === 'function') {
      try { var p = a.unlock(); if (p && p.then) p.then(null, noop); } catch (e) { /* ignore */ }
    }
  }
  var PLAY_IC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.500 6.200v11.600l9.400-5.800z"/></svg>';
  var PAUSE_IC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.500 6.500v11M15.500 6.500v11"/></svg>';
  var shelfSync = [];

  function makeSlider(label, get, set) {
    var input = h('input', { type: 'range', min: '0', max: '1', step: '0.01', 'class': 'sh-range', 'aria-label': label });
    function paint() { input.style.setProperty('--v', (parseFloat(input.value || 0) * 100) + '%'); }
    input.addEventListener('input', function () { set(parseFloat(input.value)); paint(); });
    input.addEventListener('pointerdown', wake);
    input.addEventListener('keydown', function (e) { if (/^(Arrow|Home|End|Page)/.test(e.key)) wake(); });
    shelfSync.push(function () {
      if (D.activeElement !== input) {
        var v = get();
        if (typeof v === 'number' && isFinite(v)) input.value = v;
      }
      paint();
    });
    return h('label', { 'class': 'sh-row' }, [h('span', { 'class': 'sh-name', text: label }), input]);
  }

  function buildShelf() {
    var body = $('sound-body'), a = P.audio;
    body.textContent = '';
    shelfSync = [];
    if (!a) {
      body.appendChild(h('p', { 'class': 'sh-empty', text: 'Sound is resting for now. The place is lovely in silence, too.' }));
      return;
    }
    var tracks = a.musicTracks || [], amb = a.ambients || [];

    /* music */
    var playBtn = h('button', { type: 'button', 'class': 'sh-play', 'aria-pressed': 'false' });
    playBtn.addEventListener('click', function () {
      wake();
      var playing = !!(a.music && a.music.playing);
      if (playing) audio('pauseMusic'); else audio('playMusic');
      syncShelf();
    });
    body.appendChild(h('div', { 'class': 'sh-block' }, [
      h('div', { 'class': 'sh-head' }, [h('span', { 'class': 'sh-title', text: 'music' }), playBtn])
    ]));
    var group = h('div', { 'class': 'sh-tracks', role: 'radiogroup', 'aria-label': 'Music' });
    var trackBtns = tracks.map(function (t) {
      var b = h('button', { type: 'button', 'class': 'sh-track', role: 'radio', 'aria-checked': 'false', 'data-id': t.id }, [
        h('span', { 'class': 'sh-bead' }), h('span', { text: t.name })
      ]);
      b.addEventListener('click', function () { wake(); audio('playMusic', t.id); syncShelf(); });
      group.appendChild(b);
      return b;
    });
    body.firstChild.appendChild(group);
    body.firstChild.appendChild(makeSlider('Music volume', function () { return audio('getMusicVolume'); }, function (v) { audio('setMusicVolume', v); }));

    /* master */
    body.appendChild(h('div', { 'class': 'sh-block' }, [
      makeSlider('Everything', function () { return audio('getMaster'); }, function (v) { audio('setMaster', v); })
    ]));

    /* ambients */
    var ab = h('div', { 'class': 'sh-block' }, [h('span', { 'class': 'sh-title', text: 'the sounds of the place' })]);
    amb.forEach(function (m) {
      ab.appendChild(makeSlider(m.name, function () { return audio('getAmbient', m.id); }, function (v) { audio('setAmbient', m.id, v); }));
    });
    body.appendChild(ab);

    /* footer */
    body.appendChild(h('div', { 'class': 'sh-hr' }));
    var mute = h('button', { type: 'button', 'class': 'btn', 'aria-pressed': 'false' });
    mute.addEventListener('click', function () { audio('setMuted', !a.muted); syncShelf(); });
    var back = h('button', { type: 'button', 'class': 'lnk', text: "back to this room's own sound" });
    back.addEventListener('click', function () { wake(); audio('clearOverrides'); syncShelf(); });
    body.appendChild(h('div', { 'class': 'sh-foot' }, [mute, back]));

    shelfSync.push(function () {
      var playing = !!(a.music && a.music.playing);
      playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      playBtn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
      playBtn.innerHTML = (playing ? PAUSE_IC : PLAY_IC) + '<span>' + (playing ? 'pause' : 'play') + '</span>';
      trackBtns.forEach(function (b) {
        b.setAttribute('aria-checked', (a.music && a.music.id === b.getAttribute('data-id')) ? 'true' : 'false');
      });
      mute.setAttribute('aria-pressed', a.muted ? 'true' : 'false');
      mute.textContent = a.muted ? 'let sound return' : 'mute everything';
    });
    syncShelf();
  }
  function syncShelf() {
    for (var i = 0; i < shelfSync.length; i++) { try { shelfSync[i](); } catch (e) { /* ignore */ } }
  }
  function syncSoundToken() {
    var a = P.audio, btn = els.sound;
    if (!btn) return;
    var on = !!(a && a.enabled && !a.muted);
    btn.setAttribute('data-snd', on ? 'on' : 'off');
    btn.setAttribute('aria-label', on ? 'Sound, on' : 'Sound, off');
  }

  /* ================================================================ map */
  var INK = '#3b2f27';
  var VIG = {
    garden:
      '<path d="M-62 38C-40 28-10 34 10 30C34 26 52 30 64 36C50 50-40 52-62 38Z" fill="#a9bf8a" fill-opacity=".6" stroke="none"/>' +
      '<path d="M-10 38C-9 24-8 12-12-4L-2-4C0 12 2 24 3 38Z" fill="#9a7350" fill-opacity=".85"/>' +
      '<path d="M-48-6C-58-28-34-50-18-42C-8-58 24-54 28-38C48-38 56-14 40-4C30 8-38 10-48-4Z" fill="#8fa58a" fill-opacity=".9"/>' +
      '<path d="M-30-18C-24-26-16-24-14-18M2-30C8-36 16-34 18-28M16-12C22-18 30-16 32-10" stroke="#34513a" stroke-width="1.6"/>' +
      '<ellipse cx="34" cy="43" rx="24" ry="7" fill="#bcd9e6" fill-opacity=".95"/><path d="M24 43c4-2 8-2 12 0" stroke-width="1.2"/>' +
      '<path d="M-46 46V35M-38 48V33M-30 46V37" stroke="#5e7a56"/>' +
      '<circle cx="-46" cy="33" r="3.2" fill="#d9a5a0"/><circle cx="-38" cy="31" r="3.2" fill="#ecd28a"/><circle cx="-30" cy="35" r="3.2" fill="#d9a5a0"/>',
    tearoom:
      '<ellipse cx="0" cy="4" rx="60" ry="46" fill="#ecd28a" fill-opacity=".28" stroke="none"/>' +
      '<path d="M-30 8C-32-20-6-26 10-20C26-14 28 8 14 22C2 32-26 30-30 8Z" fill="#c98263" fill-opacity=".8"/>' +
      '<path d="M-14-22C-10-32 4-32 8-22"/><circle cx="-3" cy="-34" r="3" fill="#c98263" fill-opacity=".8"/>' +
      '<path d="M-30 4C-42 2-46-10-52-14C-44-16-38-10-28-8"/><path d="M12-10C34-14 36 14 14 18"/>' +
      '<path d="M-24 2C-18-6-8-8 0-6" stroke="#fbf5e9" stroke-opacity=".7" stroke-width="2"/>' +
      '<path d="M30 14L54 14C54 32 46 38 42 38C36 38 30 32 30 14Z" fill="#fbf5e9" fill-opacity=".9"/><ellipse cx="42" cy="40" rx="17" ry="3.500" fill="#e9dcc3" fill-opacity=".9"/>' +
      '<path d="M40 6C36-2 44-6 40-14M48 8C45 2 51-1 48-8" stroke-width="1.4" stroke-opacity=".7"/>',
    livingroom:
      '<path d="M-48-34H48V-26H-48Z" fill="#9a7350" fill-opacity=".9"/>' +
      '<path d="M-40-26V46H40V-26" fill="#e3d4ba" fill-opacity=".9"/>' +
      '<path d="M-22 46V4C-22-14 22-14 22 4V46Z" fill="#5d4332" fill-opacity=".92"/>' +
      '<path d="M0 42C-14 32-8 18 0 6C4 16 14 24 12 34C10 40 4 44 0 42Z" fill="#ecd28a"/>' +
      '<path d="M0 42C-6 36-4 28 0 22C4 28 7 34 5 38C4 41 2 42 0 42Z" fill="#c98263"/>' +
      '<path d="M-40 4H-22M-40 20H-22M22 4H40M22 20H40M-40-10H-22M22-10H40" stroke-width="1.3" stroke-opacity=".6"/>' +
      '<path d="M-14 46H14" stroke-width="2.4"/>',
    bedroom:
      '<ellipse cx="0" cy="8" rx="62" ry="44" fill="#7c6f9c" fill-opacity=".2" stroke="none"/>' +
      '<path d="M-50 10H52V34H-50Z" fill="#d9a5a0" fill-opacity=".85"/><path d="M-50 19C-20 14 10 23 52 16"/>' +
      '<path d="M-52-12V46M52 4V46" stroke-width="3"/><path d="M-50 34V46M52 34V46"/>' +
      '<path d="M-46-2C-46-14-18-16-16-2C-16 8-46 10-46-2Z" fill="#fbf5e9"/>' +
      '<path d="M36-46C26-42 26-28 38-26C30-32 30-40 36-46Z" fill="#f6d9a0"/>' +
      '<path d="M8-40v6M5-37h6M-14-30v4M-16-28h4" stroke-width="1.4"/>',
    greenhouse:
      '<path d="M-50 40V-4L0-44L50-4V40Z" fill="#bcd9e6" fill-opacity=".5"/>' +
      '<path d="M0-44V40M-25-24V40M25-24V40M-50-4H50" stroke-width="1.5"/>' +
      '<path d="M-52 40H52" stroke-width="2.4"/>' +
      '<path d="M-8 40L-6 28H8L10 40Z" fill="#c98263" fill-opacity=".9"/>' +
      '<path d="M1 28C-10 16-8 4-3-2C6 6 8 18 1 28Z" fill="#8fa58a"/><path d="M1 28C10 22 20 20 24 12C14 10 4 16 1 28Z" fill="#5e7a56" fill-opacity=".9"/>' +
      '<circle cx="-34" cy="22" r="4" fill="#d9a5a0"/><path d="M-34 26V40" stroke="#5e7a56"/>' +
      '<circle cx="36" cy="26" r="4" fill="#ecd28a"/><path d="M36 30V40" stroke="#5e7a56"/>',
    sunset:
      '<ellipse cx="0" cy="-2" rx="62" ry="46" fill="#f2b89a" fill-opacity=".45" stroke="none"/>' +
      '<path d="M-28 22A28 28 0 0 1 28 22Z" fill="#ecd28a"/><path d="M-18 22A18 18 0 0 1 18 22Z" fill="#e8a87c" fill-opacity=".8" stroke="none"/>' +
      '<path d="M0-14V-24M-24-6L-31-13M24-6L31-13M-34 8H-44M34 8H44" stroke-width="1.6"/>' +
      '<path d="M-64 30C-40 14-12 26 8 20C30 12 52 24 64 28V46C20 54-40 54-62 46Z" fill="#5e7a56" fill-opacity=".85"/>' +
      '<path d="M-60-34C-30-20 30-20 60-34" stroke-width="1.4"/>' +
      '<circle cx="-36" cy="-26" r="3.200" fill="#f6d9a0"/><circle cx="-12" cy="-22" r="3.200" fill="#f6d9a0"/><circle cx="12" cy="-22" r="3.200" fill="#f6d9a0"/><circle cx="36" cy="-26" r="3.200" fill="#f6d9a0"/>'
  };

  var LAYOUT = {
    wide: {
      box: [900, 580],
      pts: { garden: [170, 310], tearoom: [310, 140], livingroom: [560, 120], bedroom: [760, 270], greenhouse: [640, 440], sunset: [360, 450] },
      closed: true,
      tufts: [[.07, .12], [.93, .1], [.5, .3], [.5, .62], [.95, .74], [.1, .84], [.55, .92]],
      compass: [70, 500]
    },
    tall: {
      box: [420, 830],
      pts: { garden: [120, 120], tearoom: [300, 235], livingroom: [120, 355], bedroom: [300, 475], greenhouse: [120, 595], sunset: [300, 715] },
      closed: false,
      tufts: [[.5, .2], [.5, .36], [.5, .52], [.5, .68], [.5, .84], [.07, .45], [.93, .9]],
      compass: null
    }
  };

  function smoothPath(pts, closed) {
    var n = pts.length, d = 'M' + pts[0][0] + ' ' + pts[0][1], i, p0, p1, p2, p3;
    var count = closed ? n : n - 1;
    for (i = 0; i < count; i++) {
      p1 = pts[i]; p2 = pts[(i + 1) % n];
      p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
      p3 = closed ? pts[(i + 2) % n] : pts[Math.min(i + 2, n - 1)];
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0] + ' ' + p2[1];
    }
    return d + (closed ? 'Z' : '');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function buildMap() {
    var body = $('map-body');
    var L = W.innerWidth < 640 ? LAYOUT.tall : LAYOUT.wide;
    var bw = L.box[0], bh = L.box[1], order = P.sceneOrder, cur = P.state.scene;
    var pts = order.map(function (id) { return L.pts[id]; });
    var s = '<svg viewBox="0 0 ' + bw + ' ' + bh + '" role="group" aria-label="Map of the little world">' +
      '<defs>' +
      '<radialGradient id="mp-paper" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fbf5e9"/><stop offset=".72" stop-color="#fbf5e9" stop-opacity=".95"/><stop offset="1" stop-color="#fbf5e9" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mp-wash" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f1e4c8" stop-opacity=".7"/><stop offset="1" stop-color="#e9dcc3" stop-opacity="0"/></radialGradient>' +
      '<filter id="mp-wobble" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>' +
      '</defs>' +
      '<rect x="0" y="0" width="' + bw + '" height="' + bh + '" fill="url(#mp-wash)"/>';

    s += '<g fill="none" stroke="#6b5a4c" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round" filter="url(#mp-wobble)">';
    L.tufts.forEach(function (t) {
      var x = (t[0] * bw).toFixed(0), y = (t[1] * bh).toFixed(0);
      s += '<path transform="translate(' + x + ' ' + y + ')" d="M0 0Q-2-6-5-9M0 0Q0-7 0-11M0 0Q2-6 5-9"/>';
    });
    if (L.compass) {
      var c = L.compass;
      s += '<g transform="translate(' + c[0] + ' ' + c[1] + ')" stroke-opacity=".7"><circle r="17"/><path d="M0-27V27M-27 0H27" stroke-width="1"/><path d="M0-22L4 0L0 22L-4 0Z" fill="#c98263" fill-opacity=".6"/></g>';
    }
    s += '</g>';

    s += '<path d="' + smoothPath(pts, L.closed) + '" fill="none" stroke="#6b5a4c" stroke-opacity=".7" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="1 11"/>';

    order.forEach(function (id) {
      var p = L.pts[id], meta = P.place(id), here = id === cur;
      s += '<g class="mp-place" tabindex="0" role="button" data-id="' + id + '" aria-label="Walk to ' + esc(meta.name) + (here ? ' (you are here)' : '') + '"' + (here ? ' aria-current="true"' : '') +
        ' transform="translate(' + p[0] + ' ' + p[1] + ')">' +
        '<ellipse cx="0" cy="4" rx="76" ry="70" fill="url(#mp-paper)"/>' +
        '<ellipse class="mp-ring" cx="0" cy="4" rx="68" ry="60" fill="none" stroke="#c98263" stroke-width="2" stroke-dasharray="6 7" stroke-linecap="round"/>' +
        '<g class="mp-art" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#mp-wobble)">' + VIG[id] + '</g>' +
        '<text class="mp-label" x="0" y="90">' + esc(meta.name) + '</text>';
      if (here) {
        s += '<path d="M-66 8C-70-30-30-66 6-62C48-58 72-20 64 20C56 56 6 70-30 62C-52 56-64 34-66 8Z" fill="none" stroke="#c98263" stroke-width="2.2" stroke-linecap="round" stroke-opacity=".85" filter="url(#mp-wobble)"/>' +
          '<text class="mp-here" x="0" y="-72">you are here</text>';
      }
      s += '<rect x="-70" y="-62" width="140" height="162" fill="transparent"/></g>';
    });
    s += '</svg>';
    body.innerHTML = s;

    Array.prototype.forEach.call(body.querySelectorAll('.mp-place'), function (g) {
      var id = g.getAttribute('data-id');
      function walk() { closePanel(true); if (id !== P.state.scene) P.go(id); }
      g.addEventListener('click', walk);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); walk(); } });
    });
  }

  /* ================================================================ journal */
  var PROMPTS = [
    'How are you feeling today?', 'What is on your mind?', 'What are you grateful for?',
    'What do you want to let go of?', 'What small thing was good today?', 'What would you tell a friend who felt like this?'
  ];
  var JKEY = 'peace.journal';
  var jcur = null, statusT = 0, jsure = null;

  function jLoad() {
    try { var v = JSON.parse(W.localStorage.getItem(JKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function jSave(list) {
    try { W.localStorage.setItem(JKEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function fmtDate(ts, long) {
    try {
      return new Date(ts).toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
    } catch (e) { return new Date(ts).toDateString(); }
  }
  function newPage() {
    return { id: null, ts: Date.now(), prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)] };
  }
  function jStatus(msg) {
    var s = $('jr-status');
    s.textContent = msg || '';
    W.clearTimeout(statusT);
    if (msg) statusT = W.setTimeout(function () { s.textContent = ''; }, 5000);
  }
  function paintPage() {
    $('jr-date').textContent = fmtDate(jcur.ts, true);
    $('jr-prompt').textContent = jcur.prompt;
    $('jr-new').hidden = !jcur.id;
  }
  function renderNotes() {
    var list = jLoad().sort(function (a, b) { return b.ts - a.ts; });
    var ul = $('jr-list');
    ul.textContent = '';
    $('jr-listh').hidden = !list.length;
    list.forEach(function (it) {
      var open = h('button', { type: 'button', 'class': 'jn-open', 'aria-label': 'Reopen the page from ' + fmtDate(it.ts, true) }, [
        h('span', { 'class': 'jn-date', text: fmtDate(it.ts, false) }),
        h('span', { 'class': 'jn-text', text: String(it.text || '').slice(0, 110) })
      ]);
      var del = h('button', { type: 'button', 'class': 'jn-del', 'aria-label': 'Let this page go', text: 'let go' });
      open.addEventListener('click', function () { reopen(it.id); });
      del.addEventListener('click', function () {
        if (del.hasAttribute('data-sure')) {
          var rest = jLoad().filter(function (x) { return x.id !== it.id; });
          jSave(rest);
          if (jcur && jcur.id === it.id) { jcur = newPage(); $('jr-text').value = ''; paintPage(); }
          renderNotes();
          jStatus('the page is gone.');
        } else {
          if (jsure && jsure !== del) { jsure.removeAttribute('data-sure'); jsure.textContent = 'let go'; }
          del.setAttribute('data-sure', ''); del.textContent = 'really?'; jsure = del;
          W.setTimeout(function () { del.removeAttribute('data-sure'); del.textContent = 'let go'; }, 3200);
        }
      });
      ul.appendChild(h('li', { 'class': 'jn' }, [open, del]));
    });
  }
  function reopen(id) {
    var it = jLoad().filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    jcur = { id: it.id, ts: it.ts, prompt: it.prompt || PROMPTS[0] };
    $('jr-text').value = it.text || '';
    paintPage();
    jStatus('reopened. change it, if you like.');
    var sc = $('panel-journal').querySelector('.sheet-in');
    if (sc) sc.scrollTop = 0;
    $('jr-text').focus();
  }
  function journalOpen() {
    if (!jcur) jcur = newPage();
    if (!jcur.id && !$('jr-text').value) jcur.ts = Date.now();
    paintPage();
    renderNotes();
    jStatus('');
  }
  function bindJournal() {
    $('jr-another').addEventListener('click', function () {
      var i = PROMPTS.indexOf(jcur.prompt);
      jcur.prompt = PROMPTS[(i + 1) % PROMPTS.length];
      paintPage();
      $('jr-text').focus();
    });
    $('jr-new').addEventListener('click', function () {
      jcur = newPage(); $('jr-text').value = ''; paintPage(); jStatus(''); $('jr-text').focus();
    });
    $('jr-keep').addEventListener('click', function () {
      var txt = $('jr-text').value.trim();
      if (!txt) { jStatus('a blank page is fine too. write a few words when you like.'); $('jr-text').focus(); return; }
      var list = jLoad();
      var found = jcur.id ? list.filter(function (x) { return x.id === jcur.id; })[0] : null;
      if (found) { found.text = txt; found.prompt = jcur.prompt; }
      else {
        jcur.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        list.push({ id: jcur.id, ts: jcur.ts, prompt: jcur.prompt, text: txt });
      }
      if (!jSave(list)) { jStatus('this browser would not let me keep the page.'); return; }
      audio('sfx', 'page');
      jcur = newPage();
      $('jr-text').value = '';
      paintPage();
      renderNotes();
      jStatus('kept. a fresh page is ready.');
    });
  }

  /* ================================================================ breathe */
  function bthAt(fn, ms) { bthTimers.push(W.setTimeout(fn, ms)); }
  function setWord(txt, instant) {
    var w = $('bth-word');
    if (instant) { w.textContent = txt; w.classList.remove('out'); return; }
    w.classList.add('out');
    bthAt(function () { w.textContent = txt; w.classList.remove('out'); }, 420);
  }
  function orbTo(scale, secs) {
    var orb = $('bth-orb');
    if (P.state.reducedMotion) {
      orb.style.transition = 'opacity ' + secs + 's ease';
      orb.style.transform = 'scale(.78)';
      orb.style.opacity = scale > .7 ? '.98' : '.55';
      return;
    }
    orb.style.transition = 'transform ' + secs + 's cubic-bezier(.45,.05,.4,1), opacity ' + secs + 's ease';
    orb.style.transform = 'scale(' + scale + ')';
    orb.style.opacity = scale > .7 ? '.98' : '.62';
  }
  function chime() { audio('sfx', 'chime'); }

  function startBreathe() {
    if (breathing) return;
    closePanel(true);
    breathing = true;
    html.setAttribute('data-calm', 'true');
    var bth = $('breathe'), orb = $('bth-orb');
    Array.prototype.forEach.call($('bth-dots').children, function (d) { d.classList.remove('is-done'); });
    orb.style.transition = 'none'; orb.style.transform = 'scale(.45)'; orb.style.opacity = '.7';
    setWord('breathe in', true);
    bth.hidden = false;
    void bth.offsetWidth;
    bth.classList.add('on');
    try { $('bth-stop').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    bthAt(function () { round(0); }, 1800);
  }
  function round(i) {
    if (!breathing) return;
    if (i >= 6) {
      setWord('there you are.');
      orbTo(.7, 3);
      chime();
      bthAt(function () { stopBreathe(); }, 5200);
      return;
    }
    setWord('breathe in'); orbTo(1, 4); chime();
    bthAt(function () {
      setWord('hold'); chime();
      bthAt(function () {
        setWord('breathe out'); orbTo(.45, 6); chime();
        bthAt(function () {
          var d = $('bth-dots').children[i]; if (d) d.classList.add('is-done');
          round(i + 1);
        }, 6000);
      }, 4000);
    }, 4000);
  }
  function stopBreathe(quick) {
    if (!breathing) return;
    breathing = false;
    bthTimers.forEach(function (t) { W.clearTimeout(t); });
    bthTimers = [];
    var bth = $('breathe');
    bth.classList.remove('on');
    var done = function () { bth.hidden = true; html.removeAttribute('data-calm'); bump(); };
    if (quick || P.state.reducedMotion) done(); else bthAt2(done, 1700);
    var b = els.breatheBtn;
    if (b && !quick) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function bthAt2(fn, ms) { W.setTimeout(fn, ms); }

  /* ================================================================ let go */
  var BOAT = '<svg viewBox="0 0 230 150" aria-hidden="true">' +
    '<path d="M112 8L200 88H112Z" fill="#f8efdc" stroke="#6b5a4c" stroke-opacity=".5" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M112 8L34 88H112Z" fill="#e9d8b6" stroke="#6b5a4c" stroke-opacity=".5" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M10 88H220L196 132C194 135 191 136 188 136H42C39 136 36 135 34 132Z" fill="#fbf5e9" stroke="#6b5a4c" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M18 97H212" stroke="#6b5a4c" stroke-opacity=".22" stroke-width="1"/></svg>';

  function launchBoat(text) {
    var layer = $('lg-layer'), still = P.state.reducedMotion;
    var boat = h('div', { 'class': 'lg-boat' });
    boat.style.top = (50 + Math.random() * 14).toFixed(1) + '%';
    boat.innerHTML = '<div class="lg-bob">' + BOAT + '<div class="lg-wake"></div><div class="lg-words"></div></div>';
    var w = boat.querySelector('.lg-words');
    w.textContent = text;
    w.className = 'lg-words' + (text.length > 34 ? ' s3' : (text.length > 18 ? ' s2' : ''));
    var light = h('div', { 'class': 'lg-light' });
    layer.appendChild(light);
    layer.appendChild(boat);
    audio('sfx', 'water');
    W.setTimeout(function () { w.classList.add('dissolve'); }, still ? 2600 : 6500);
    W.setTimeout(function () {
      if (boat.parentNode) boat.parentNode.removeChild(boat);
      if (light.parentNode) light.parentNode.removeChild(light);
    }, still ? 8400 : 20800);
  }
  function bindLetGo() {
    $('lg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = $('lg-input'), txt = inp.value.trim();
      if (!txt) { inp.focus(); return; }
      inp.value = '';
      closePanel(true);
      W.setTimeout(function () { launchBoat(txt); }, 350);
    });
  }

  /* ================================================================ more (phone) */
  var MORE = [['journal', 'Journal'], ['breathe', 'Breathe'], ['letgo', 'Let go'], ['time', 'Time of day'], ['still', 'Still mode'], ['hide', 'Hide the interface']];
  function buildMore() {
    var ul = $('more-list');
    ul.textContent = '';
    MORE.forEach(function (m) {
      var src = $('btn-' + m[0]);
      var ic = src && (src.querySelector('.ic-set') || src.querySelector('svg'));
      var b = h('button', { type: 'button', 'class': 'more-btn', 'data-act': m[0], 'data-more': m[0] });
      if (ic) b.appendChild(ic.cloneNode(true));
      b.appendChild(h('span', { text: m[1] }));
      if (m[0] === 'still') b.setAttribute('aria-pressed', P.state.still ? 'true' : 'false');
      ul.appendChild(h('li', null, [b]));
    });
    syncTime();
  }

  /* ================================================================ interface state */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function syncTime() {
    var t = P.state.time, nx = TIMES[(TIMES.indexOf(t) + 1) % TIMES.length];
    if (!els.time) return;
    els.time.setAttribute('aria-label', 'Time of day: ' + t + '. Change to ' + nx);
    els.time.setAttribute('data-label', t === 'day' ? 'Daylight' : cap(t));
    var m = D.querySelector('[data-more="time"] span:last-child');
    if (m) m.textContent = 'Time of day: ' + t;
  }
  function syncStill() {
    var on = !!P.state.still;
    if (els.still) els.still.setAttribute('aria-pressed', on ? 'true' : 'false');
    var m = D.querySelector('[data-more="still"]');
    if (m) m.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function syncPlace(id) {
    var meta = P.place(id || P.state.scene || 'garden');
    var n = $('place-name');
    if (n.textContent !== meta.name) {
      n.classList.add('swap');
      W.setTimeout(function () { n.textContent = meta.name; n.classList.remove('swap'); }, 420);
    }
    els.place.setAttribute('aria-label', 'Open the map. You are in ' + meta.name);
    if (P.state.entered) $('live').textContent = 'You are in ' + meta.name + '. ' + meta.tagline;
  }
  function toggleHide(hide) {
    if (hide) {
      closePanel(true);
      html.setAttribute('data-ui', 'hidden');
      try { els.reveal.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    } else {
      html.removeAttribute('data-ui');
      try { els.hide.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function perform(act, btn, fromMore) {
    var opener = fromMore ? els.more : btn;
    switch (act) {
      case 'sound': openPanel('sound', opener); break;
      case 'map': openPanel('map', opener); break;
      case 'journal': openPanel('journal', opener); break;
      case 'letgo': openPanel('letgo', opener); break;
      case 'more': openPanel('more', opener); break;
      case 'breathe': startBreathe(); break;
      case 'time':
        P.setTime(TIMES[(TIMES.indexOf(P.state.time) + 1) % TIMES.length]);
        break;
      case 'still': P.setStill(!P.state.still); break;
      case 'hide': toggleHide(true); break;
      case 'reveal': toggleHide(false); break;
      case 'prev': P.step(-1); break;
      case 'next': P.step(1); break;
    }
  }

  /* ================================================================ idle */
  function goIdle() {
    if (!P.state.entered) return;
    if (openName || breathing) { idleT = W.setTimeout(goIdle, 2500); return; }
    html.setAttribute('data-idle', 'true');
  }
  function bump() {
    if (html.getAttribute('data-idle') === 'true') html.removeAttribute('data-idle');
    W.clearTimeout(idleT);
    if (P.state.entered) idleT = W.setTimeout(goIdle, 8000);
  }
  function onActivity() {
    var t = Date.now();
    if (html.hasAttribute('data-idle') || t - lastBump > 400) { lastBump = t; bump(); }
  }

  /* ================================================================ kind note */
  function showNote() {
    var n = $('kindnote');
    if (!n || n.dataset.shown) return;
    n.dataset.shown = '1';
    n.classList.remove('leaving');
    n.hidden = false;
    var away = function () {
      if (n.hidden || n.classList.contains('leaving')) return;
      n.classList.add('leaving');
      W.setTimeout(function () { n.hidden = true; }, P.state.reducedMotion ? 50 : 2300);
    };
    $('kindnote-btn').addEventListener('click', away);
    W.setTimeout(away, 17000);
  }

  /* ================================================================ opening */
  function bindOpening() {
    var radios = Array.prototype.slice.call(D.querySelectorAll('.op-toggle [role="radio"]'));
    radios.forEach(function (r) {
      r.addEventListener('click', function () {
        soundChoice = r.getAttribute('data-snd') === 'on';
        radios.forEach(function (o) { o.setAttribute('aria-checked', o === r ? 'true' : 'false'); });
      });
      r.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault(); e.stopPropagation();
          var o = radios[(radios.indexOf(r) + 1) % radios.length];
          o.click(); o.focus();
        }
      });
    });
    $('btn-enter').addEventListener('click', function () {
      if (entering) return;
      entering = true;
      var a = P.audio;
      /* the click is the gesture: unlock synchronously */
      if (soundChoice && a) {
        var p = null;
        try { if (typeof a.unlock === 'function') p = a.unlock(); } catch (e) { /* ignore */ }
        try { if (typeof a.playMusic === 'function') a.playMusic('piano'); } catch (e) { /* ignore */ }
        try {
          var def = P.scenes[P.state.scene];
          if (typeof a.setSceneAmbience === 'function') a.setSceneAmbience((def && def.ambience) || {});
        } catch (e) { /* ignore */ }
        if (p && typeof p.then === 'function') {
          p.then(function () {
            try { if (a.music && !a.music.playing && typeof a.playMusic === 'function') a.playMusic('piano'); } catch (e) { /* ignore */ }
            syncSoundToken();
          }, noop);
        }
      }
      P.enter();
    });
  }

  function afterEnter() {
    var stage = $('stage'), op = $('opening');
    if (stage) stage.inert = false;
    W.setTimeout(function () { html.setAttribute('data-ui-ready', 'true'); }, P.state.reducedMotion ? 200 : 2600);
    W.setTimeout(function () { op.hidden = true; }, P.state.reducedMotion ? 300 : 3600);
    syncSoundToken();
    syncPlace();
    bump();
    W.setTimeout(showNote, 240000);
  }

  /* ================================================================ init */
  function init() {
    els.sound = $('btn-sound'); els.place = $('btn-place'); els.time = $('btn-time'); els.still = $('btn-still');
    els.hide = $('btn-hide'); els.reveal = $('btn-reveal'); els.more = $('btn-more'); els.breatheBtn = $('btn-breathe');
    if (!els.place || !$('opening')) return;

    var stage = $('stage');
    if (stage && !P.state.entered) stage.inert = true;

    bindPanels();
    bindJournal();
    bindLetGo();
    bindOpening();

    D.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      var act = b.getAttribute('data-act');
      var fromMore = !!b.closest('#panel-more');
      if (fromMore) closePanel(true);
      perform(act, b, fromMore);
    });
    $('bth-stop').addEventListener('click', function () { stopBreathe(); });

    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      W.addEventListener(ev, onActivity, { passive: true, capture: true });
    });

    P.on('entered', afterEnter);
    P.on('scene:enter', function (d) { syncPlace(d && d.id); });
    P.on('time', syncTime);
    P.on('motion', syncStill);
    P.on('audio:change', function () { syncSoundToken(); if (openName === 'sound') syncShelf(); });
    P.on('ui:map', function () { if (!breathing) openPanel('map', els.place); });
    P.on('ui:hide', function () { if (!breathing) toggleHide(html.getAttribute('data-ui') !== 'hidden'); });
    P.on('ui:escape', function () { if (breathing) stopBreathe(); else if (openName) closePanel(); });

    syncTime(); syncStill(); syncSoundToken(); syncPlace();
    try { $('btn-enter').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  P.ui = { open: openPanel, close: closePanel, breathe: startBreathe };

  if (D.readyState === 'complete') init();
  else D.addEventListener('DOMContentLoaded', init);
})();
