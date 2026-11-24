/* Somewhere, A Little Peace - core.js
   Owns window.Peace: scenes, transitions, shared loop, hotspots, time, motion, keys. */
(function () {
  'use strict';

  var W = window, D = document, html = D.documentElement;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var Peace = W.Peace = W.Peace || {};

  var order = ['garden', 'tearoom', 'livingroom', 'bedroom', 'greenhouse', 'sunset'];
  var TIMES = ['day', 'dusk', 'night'];

  var places = {
    garden:     { name: 'The Garden',        tagline: 'an afternoon, wide open' },
    tearoom:    { name: 'The Tea Room',      tagline: 'warm cups, slow afternoons' },
    livingroom: { name: 'The Living Room',   tagline: 'firelight and rain on the glass' },
    bedroom:    { name: 'The Bedroom',       tagline: 'soft blankets, quiet night' },
    greenhouse: { name: 'The Greenhouse',    tagline: 'glass, green, growing things' },
    sunset:     { name: 'The Sunset Corner', tagline: 'the day, letting go' }
  };

  var state = { scene: null, time: 'day', reducedMotion: false, entered: false, still: false, busy: false };
  var scenes = {};
  var handlers = {};
  var recs = [];          // live scene records (current, plus the incoming one mid-transition)
  var current = null;
  var busy = false;
  var timeManual = false;
  var stage = null, veil = null, hintEl = null, cardName = null, cardTag = null;
  var mq = null;

  function noop() {}
  function isId(id) { return order.indexOf(id) > -1; }

  /* ---------- events ---------- */
  function on(ev, fn) { if (typeof fn !== 'function') return; (handlers[ev] = handlers[ev] || []).push(fn); }
  function off(ev, fn) {
    var l = handlers[ev]; if (!l) return;
    var i = l.indexOf(fn); if (i > -1) l.splice(i, 1);
  }
  function emit(ev, data) {
    var l = handlers[ev]; if (!l) return;
    l = l.slice();
    for (var i = 0; i < l.length; i++) {
      try { l[i](data); } catch (e) { console.error('[Peace] handler for "' + ev + '" failed', e); }
    }
  }

  /* ---------- audio guard ---------- */
  function audio(name) {
    try {
      var a = Peace.audio;
      if (a && typeof a[name] === 'function') {
        var r = a[name].apply(a, Array.prototype.slice.call(arguments, 1));
        if (r && typeof r.then === 'function') r.then(null, noop);
        return r;
      }
    } catch (e) { console.warn('[Peace] audio.' + name + ' failed', e); }
    return undefined;
  }

  /* ---------- util ---------- */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function el(markup) {
    var t = D.createElement('template');
    t.innerHTML = String(markup).trim();
    return t.content.firstElementChild;
  }
  function svg(markup) {
    var holder = D.createElementNS(SVGNS, 'svg');
    holder.innerHTML = String(markup).trim();
    return holder.firstElementChild;
  }
  function canvas(root, className) {
    var c = D.createElement('canvas');
    if (className) c.className = className;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:block';
    root.appendChild(c);
    var g = c.getContext('2d');
    var w = 1, h = 1;
    function size() {
      var dpr = Math.min(W.devicePixelRatio || 1, 2);
      w = Math.max(1, root.clientWidth || W.innerWidth);
      h = Math.max(1, root.clientHeight || W.innerHeight);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    if (typeof W.ResizeObserver === 'function') {
      try { new W.ResizeObserver(size).observe(root); } catch (e) { W.addEventListener('resize', size); }
    } else {
      W.addEventListener('resize', size);
    }
    return { canvas: c, ctx2d: g, w: function () { return w; }, h: function () { return h; } };
  }
  function sceneToScreen(svgEl, x, y) {
    var m = svgEl && svgEl.getScreenCTM && svgEl.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var owner = svgEl.ownerSVGElement || svgEl;
    var p = owner.createSVGPoint();
    p.x = x; p.y = y;
    var q = p.matrixTransform(m);
    var root = svgEl.closest ? svgEl.closest('.scene') : null;
    var r = root ? root.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: q.x - r.left, y: q.y - r.top };
  }

  var util = {
    rand: rand, pick: pick, clamp: clamp, lerp: lerp, el: el, svg: svg, canvas: canvas,
    sceneToScreen: sceneToScreen, audio: audio
  };

  /* ---------- motion ---------- */
  function readStill() {
    try { return W.localStorage.getItem('peace.still') === '1'; } catch (e) { return false; }
  }
  function updateMotion() {
    var r = !!(mq && mq.matches) || state.still;
    var changed = r !== state.reducedMotion;
    state.reducedMotion = r;
    if (r) html.setAttribute('data-motion', 'reduced'); else html.removeAttribute('data-motion');
    if (changed) { emit('motion', { reduced: r }); }
    ensureLoop();
  }
  function setStill(v) {
    state.still = !!v;
    try { W.localStorage.setItem('peace.still', state.still ? '1' : '0'); } catch (e) { /* ignore */ }
    updateMotion();
    emit('motion', { reduced: state.reducedMotion });
  }

  /* ---------- shared rAF loop ---------- */
  var raf = 0, lastT = 0;
  function hasLoops() {
    for (var i = 0; i < recs.length; i++) if (recs[i].loops.length) return true;
    return false;
  }
  function ensureLoop() {
    if (raf || D.hidden || state.reducedMotion || !hasLoops()) return;
    lastT = 0;
    raf = W.requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (D.hidden || state.reducedMotion) return;
    var t = now / 1000;
    var dt = lastT ? Math.min(t - lastT, 0.1) : 0.016;
    lastT = t;
    var list = recs.slice();
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      var fns = rec.loops.slice();
      for (var j = 0; j < fns.length; j++) {
        try { fns[j](t, dt); }
        catch (e) {
          console.error('[Peace] a scene loop failed and was stopped', e);
          var k = rec.loops.indexOf(fns[j]); if (k > -1) rec.loops.splice(k, 1);
        }
      }
    }
    if (hasLoops()) raf = W.requestAnimationFrame(tick);
  }
  D.addEventListener('visibilitychange', function () {
    if (D.hidden) { if (raf) { W.cancelAnimationFrame(raf); raf = 0; } }
    else ensureLoop();
  });

  /* ---------- scene records ---------- */
  function makeCtx(rec) {
    return {
      time: state.time,
      reducedMotion: state.reducedMotion,
      loop: function (fn) {
        if (typeof fn !== 'function' || rec.dead) return noop;
        rec.loops.push(fn);
        ensureLoop();
        return function () { var i = rec.loops.indexOf(fn); if (i > -1) rec.loops.splice(i, 1); };
      },
      onCleanup: function (fn) { if (typeof fn === 'function') rec.cleanups.push(fn); },
      timer: function (fn, ms) {
        if (rec.dead) return 0;
        var id = W.setTimeout(function () {
          var i = rec.timers.indexOf(id); if (i > -1) rec.timers.splice(i, 1);
          if (rec.dead) return;
          try { fn(); } catch (e) { console.error('[Peace] scene timer failed', e); }
        }, ms);
        rec.timers.push(id);
        return id;
      },
      every: function (fn, ms) {
        if (rec.dead) return 0;
        var id = W.setInterval(function () {
          if (rec.dead) return;
          try { fn(); } catch (e) { console.error('[Peace] scene interval failed', e); }
        }, ms);
        rec.intervals.push(id);
        return id;
      }
    };
  }

  function releaseRec(rec) {
    rec.dead = true;
    var i;
    for (i = rec.cleanups.length - 1; i >= 0; i--) {
      try { rec.cleanups[i](); } catch (e) { console.error('[Peace] scene cleanup failed', e); }
    }
    rec.cleanups.length = 0;
    for (i = 0; i < rec.timers.length; i++) W.clearTimeout(rec.timers[i]);
    for (i = 0; i < rec.intervals.length; i++) W.clearInterval(rec.intervals[i]);
    rec.timers.length = 0; rec.intervals.length = 0; rec.loops.length = 0;
  }

  function retire(rec) {
    if (!rec) return;
    releaseRec(rec);
    var i = recs.indexOf(rec); if (i > -1) recs.splice(i, 1);
    if (rec.root && rec.root.parentNode) rec.root.parentNode.removeChild(rec.root);
    if (current === rec) current = null;
  }

  function fallbackMarkup(id) {
    var p = places[id] || { name: 'Somewhere quiet', tagline: '' };
    return '<div class="fb">' +
      '<svg class="fb-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="fb-sky" x1="0" y1="0" x2="0" y2="1"><stop class="fb-s1" offset="0"/><stop class="fb-s2" offset="1"/></linearGradient>' +
      '<radialGradient id="fb-sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fbf0d8" stop-opacity=".95"/><stop offset="1" stop-color="#f6d9a0" stop-opacity="0"/></radialGradient>' +
      '<filter id="fb-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2"/></filter></defs>' +
      '<rect width="1600" height="900" fill="url(#fb-sky)"/>' +
      '<circle cx="1140" cy="330" r="260" fill="url(#fb-sun)"/>' +
      '<path class="fb-h1" filter="url(#fb-soft)" d="M0 560C200 480 380 520 560 490S900 430 1120 480 1460 520 1600 470V900H0Z"/>' +
      '<path class="fb-h2" filter="url(#fb-soft)" d="M0 640C220 580 420 630 640 600S1000 560 1240 610 1500 640 1600 600V900H0Z"/>' +
      '<path class="fb-h3" d="M0 740C260 700 520 750 780 720S1180 690 1400 735 1560 740 1600 730V900H0Z"/>' +
      '</svg>' +
      '<div class="fb-text"><h3></h3><p></p></div></div>';
  }
  function buildFallback(rec) {
    var p = places[rec.id] || {};
    rec.root.innerHTML = fallbackMarkup(rec.id);
    var h = rec.root.querySelector('.fb-text h3'), t = rec.root.querySelector('.fb-text p');
    if (h) h.textContent = p.name || '';
    if (t) t.textContent = p.tagline || '';
  }

  /* ---------- time ---------- */
  function applyTime(time, manual) {
    if (TIMES.indexOf(time) < 0) return;
    if (manual) timeManual = true;
    if (time === state.time && html.getAttribute('data-time') === time) return;
    state.time = time;
    html.setAttribute('data-time', time);
    if (current && current.def && typeof current.def.onTime === 'function' && !current.dead) {
      try { current.def.onTime(time, current.root); } catch (e) { console.error('[Peace] onTime failed', e); }
    }
    emit('time', { time: time });
  }
  function setTime(time) { applyTime(time, true); }

  /* ---------- scene build / transition ---------- */
  function build(id, extraClass) {
    var def = scenes[id] || null;
    if (def && !timeManual && TIMES.indexOf(def.preferredTime) > -1) applyTime(def.preferredTime, false);
    var rec = { id: id, def: def, root: null, loops: [], cleanups: [], timers: [], intervals: [], dead: false };
    var root = D.createElement('section');
    root.className = 'scene scene-' + id + (extraClass ? ' ' + extraClass : '');
    root.setAttribute('data-scene', id);
    rec.root = root;
    stage.insertBefore(root, veil && veil.parentNode === stage ? veil : null);
    recs.push(rec);
    current = rec;
    state.scene = id;
    html.setAttribute('data-scene', id);

    var ok = false;
    if (def && typeof def.mount === 'function') {
      try { def.mount(root, makeCtx(rec)); ok = true; }
      catch (err) {
        console.error('[Peace] scene "' + id + '" failed to mount', err);
        releaseRec(rec);
        rec.dead = false;
        while (root.firstChild) root.removeChild(root.firstChild);
      }
    } else if (!def) {
      console.warn('[Peace] scene "' + id + '" is not registered; showing the painted fallback');
    }
    if (!ok) buildFallback(rec);
    audio('setSceneAmbience', (def && def.ambience) || {});
    ensureLoop();
    return rec;
  }

  function setCard(id) {
    var p = places[id] || {};
    if (cardName) cardName.textContent = p.name || '';
    if (cardTag) cardTag.textContent = p.tagline || '';
  }

  function go(id) {
    if (!stage || !isId(id) || busy || id === state.scene) return false;
    busy = true; state.busy = true;
    hideHint();
    var from = current;
    emit('scene:leave', { id: state.scene });
    setCard(id);
    if (state.reducedMotion) quickSwap(id, from); else fullSwap(id, from);
    return true;
  }

  function arrived(rec) {
    emit('scene:enter', { id: rec.id, def: rec.def });
  }
  function finish() { busy = false; state.busy = false; }

  function fullSwap(id, from) {
    stage.classList.add('is-leaving');
    if (from) from.root.classList.add('is-old');
    W.setTimeout(function () { html.setAttribute('data-card', 'on'); }, 450);
    W.setTimeout(function () {
      retire(from);
      var rec = build(id, 'is-arriving');
      void rec.root.offsetWidth;
      rec.root.classList.add('is-settling');
      rec.root.classList.remove('is-arriving');
      stage.classList.remove('is-leaving');
      arrived(rec);
    }, 1050);
    W.setTimeout(function () { html.removeAttribute('data-card'); }, 2050);
    W.setTimeout(function () {
      if (current && current.root) current.root.classList.remove('is-settling');
      finish();
    }, 2800);
  }

  function quickSwap(id, from) {
    if (from) from.root.classList.add('is-xfade');
    var rec = build(id, 'is-xfade is-xfade-in');
    void rec.root.offsetWidth;
    if (from) from.root.classList.add('is-xfade-in');
    rec.root.classList.remove('is-xfade-in');
    arrived(rec);
    W.setTimeout(function () {
      retire(from);
      if (rec.root) rec.root.classList.remove('is-xfade');
      finish();
    }, 450);
  }

  function step(dir) {
    var i = order.indexOf(state.scene);
    if (i < 0) i = 0;
    var n = (i + (dir < 0 ? -1 : 1) + order.length) % order.length;
    return go(order[n]);
  }

  function registerScene(def) {
    if (!def || typeof def.id !== 'string' || !isId(def.id)) {
      console.warn('[Peace] registerScene: unknown or missing id', def && def.id);
      return;
    }
    scenes[def.id] = def;
    places[def.id] = {
      name: def.name || (places[def.id] && places[def.id].name) || def.id,
      tagline: def.tagline != null ? def.tagline : ((places[def.id] && places[def.id].tagline) || '')
    };
  }

  function enter() {
    if (state.entered) return;
    state.entered = true;
    html.setAttribute('data-entered', 'true');
    emit('entered');
  }

  /* ---------- hotspots ---------- */
  var hintTimer = 0, hintOn = false;
  function hintText(h) { return h.getAttribute('data-hint') || h.getAttribute('aria-label') || ''; }
  function placeHint(x, y, above, h) {
    var w = hintEl.offsetWidth, ht = hintEl.offsetHeight, left, top;
    if (above) { left = x - w / 2; top = y - ht - 10; }
    else { left = x + 16; top = y + 20; if (left + w > W.innerWidth - 8) left = x - w - 12; }
    left = clamp(left, 8, Math.max(8, W.innerWidth - w - 8));
    top = clamp(top, 8, Math.max(8, W.innerHeight - ht - 8));
    hintEl.style.transform = 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)';
  }
  function showHint(h, x, y, above) {
    if (!hintEl) return;
    var txt = hintText(h);
    if (!txt) { hideHint(); return; }
    if (hintEl.textContent !== txt) hintEl.textContent = txt;
    hintEl.classList.add('on'); hintOn = true;
    placeHint(x, y, above, h);
  }
  function hideHint() {
    W.clearTimeout(hintTimer);
    if (hintEl) hintEl.classList.remove('on');
    hintOn = false;
  }
  function hotspotOf(t) { return t && t.closest ? t.closest('.hotspot') : null; }

  function bindHotspots() {
    D.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var h = hotspotOf(e.target);
      if (h && !state.busy) showHint(h, e.clientX, e.clientY, false);
      else if (hintOn) hideHint();
    }, { passive: true });
    D.addEventListener('pointerdown', function (e) {
      var h = hotspotOf(e.target);
      if (!h) { if (hintOn) hideHint(); return; }
      if (e.pointerType === 'touch') {
        showHint(h, e.clientX, e.clientY - 24, true);
        W.clearTimeout(hintTimer);
        hintTimer = W.setTimeout(hideHint, 1800);
      }
    }, { passive: true });
    html.addEventListener('pointerleave', hideHint);
    D.addEventListener('focusin', function (e) {
      var h = hotspotOf(e.target);
      if (!h) return;
      var focusVisible = true;
      try { focusVisible = h.matches(':focus-visible'); } catch (err) { /* old browsers */ }
      if (!focusVisible) return;
      var r = h.getBoundingClientRect();
      showHint(h, r.left + r.width / 2, r.top, true);
    });
    D.addEventListener('focusout', function (e) { if (hotspotOf(e.target)) hideHint(); });
    D.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var h = hotspotOf(e.target);
      if (!h || e.target !== h) return;
      e.preventDefault();
      h.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: W }));
    });
    D.addEventListener('click', function (e) {
      var g = e.target && e.target.closest ? e.target.closest('[data-go]') : null;
      if (!g) return;
      var id = g.getAttribute('data-go');
      if (isId(id)) { hideHint(); go(id); }
    });
  }

  /* ---------- keyboard ---------- */
  function bindKeys() {
    D.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      if (k === 'Escape') { emit('ui:escape'); return; }
      if (!state.entered) return;
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (k === 'm' || k === 'M') { e.preventDefault(); emit('ui:map'); return; }
      if (k === 'h' || k === 'H') { e.preventDefault(); emit('ui:hide'); return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        if (D.querySelector('dialog[open]')) return;
        if (t && t.getAttribute && t.getAttribute('role') === 'radio') return;
        e.preventDefault();
        step(k === 'ArrowLeft' ? -1 : 1);
      }
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    stage = D.getElementById('stage');
    if (!stage) {
      stage = D.createElement('div'); stage.id = 'stage';
      D.body.insertBefore(stage, D.body.firstChild);
    }
    veil = D.getElementById('veil');
    hintEl = D.getElementById('hint');
    cardName = D.getElementById('card-name');
    cardTag = D.getElementById('card-tag');

    try { mq = W.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { mq = null; }
    state.still = readStill();
    updateMotion();
    if (mq) {
      var h = function () { updateMotion(); };
      if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h);
    }

    html.setAttribute('data-time', state.time);
    html.setAttribute('data-entered', 'false');
    bindHotspots();
    bindKeys();

    var rec = build('garden', '');
    arrived(rec);
  }

  /* ---------- public ---------- */
  Peace.sceneOrder = order;
  Peace.scenes = scenes;
  Peace.state = state;
  Peace.registerScene = registerScene;
  Peace.go = go;
  Peace.step = step;
  Peace.setTime = setTime;
  Peace.setStill = setStill;
  Peace.enter = enter;
  Peace.place = function (id) { var p = places[id] || {}; return { id: id, name: p.name || id, tagline: p.tagline || '' }; };
  Peace.on = on;
  Peace.off = off;
  Peace.emit = emit;
  Peace.util = util;

  if (D.readyState === 'complete') boot();
  else D.addEventListener('DOMContentLoaded', boot);
})();
