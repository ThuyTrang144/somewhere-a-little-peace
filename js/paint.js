/* Peace.paint - AI-painted scene backdrops.
   mount(root, ctx, {scene, base}) -> {stage, setTime(t)}
   The stage is a 16:9 box that covers the viewport; overlays and hotspots are placed in % of it.
   Images: assets/art/{scene}-{day|dusk|night}.jpg   Optional loops: assets/art/{scene}-{time}.mp4 */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P) { return; }

  var TIMES = ['day', 'dusk', 'night'];
  var FADE_MS = 2600;
  var D = document;

  function make(tag, cls, parent) {
    var n = D.createElement(tag);
    if (cls) { n.className = cls; }
    if (parent) { parent.appendChild(n); }
    return n;
  }
  function pct(v) { return (Math.round(v * 100) / 100) + '%'; }
  /* rect {x,y,w,h} in % of the stage (top-left origin) */
  function place(node, r) {
    node.style.left = pct(r.x);
    node.style.top = pct(r.y);
    if (r.w != null) { node.style.width = pct(r.w); }
    if (r.h != null) { node.style.height = pct(r.h); }
    return node;
  }

  /* absolutely positioned overlay box */
  function box(stage, cls, rect, tag) {
    var n = make(tag || 'div', 'pt-box ' + (cls || ''));
    n.setAttribute('aria-hidden', 'true');
    place(n, rect);
    stage.appendChild(n);
    return n;
  }

  /* three soft wisps rising; toggle class "on" */
  function steam(stage, rect, cls) {
    var n = box(stage, 'pt-steam ' + (cls || ''), rect);
    n.appendChild(make('i'));
    n.appendChild(make('i'));
    n.appendChild(make('i'));
    return n;
  }

  /* soft light blob (screen blended); colour via style --c */
  function glow(stage, cls, rect, colour) {
    var n = box(stage, 'pt-glow ' + (cls || ''), rect);
    if (colour) { n.style.setProperty('--c', colour); }
    return n;
  }

  /* transparent hotspot buttons from one config table: {key: {x,y,w,h,hint,go,label,cls}} */
  function spots(stage, table, prefix) {
    var out = {};
    Object.keys(table).forEach(function (k) {
      var s = table[k];
      var b = make('button', 'hotspot pt-hs ' + (prefix ? prefix + '-hs ' + prefix + '-hs-' + k : '') + (s.cls ? ' ' + s.cls : ''));
      b.type = 'button';
      place(b, s);
      if (s.hint) {
        b.setAttribute('data-hint', s.hint);
        b.setAttribute('aria-label', s.label || s.hint);
      }
      if (s.go) { b.setAttribute('data-go', s.go); }
      if (s.round) { b.style.borderRadius = '50%'; }
      stage.appendChild(b);
      out[k] = b;
    });
    return out;
  }

  function setHint(node, text) {
    if (!node) { return; }
    node.setAttribute('data-hint', text);
    node.setAttribute('aria-label', text);
  }

  function mount(root, ctx, opts) {
    var scene = opts.scene;
    var base = TIMES.indexOf(opts.base) > -1 ? opts.base : 'day';
    var still = function () { return !!(ctx.reducedMotion || (P.state && P.state.reducedMotion)); };
    var url = function (t, ext) { return 'assets/art/' + scene + '-' + t + '.' + ext; };

    var breath = make('div', 'pt-breath', root);
    var drift = make('div', 'pt-drift', breath);
    var stage = make('div', 'pt-stage pt-stage-' + scene, drift);
    stage.setAttribute('data-pt-scene', scene);

    var grads = {}, layers = {}, vids = {};
    var cur = null, prev = null;

    TIMES.forEach(function (t) { grads[t] = make('div', 'pt-grad pt-grad-' + t, stage); });

    TIMES.forEach(function (t) {
      var img = make('img', 'pt-img pt-img-' + t);
      var L = { t: t, el: img, fb: false };
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      img.setAttribute('aria-hidden', 'true');
      img.onload = function () { img.classList.add('ok'); };
      img.onerror = function () {
        if (L.fb || t === base) { img.classList.remove('ok'); img.style.display = 'none'; return; }
        L.fb = true;
        img.classList.add('pt-tint', 'pt-f-' + base + '-' + t);
        img.src = url(base, 'jpg');
      };
      img.src = url(t, 'jpg');
      stage.appendChild(img);
      layers[t] = L;
    });

    var vidBox = make('div', 'pt-vids', stage);
    vidBox.setAttribute('aria-hidden', 'true');

    function tryVideo(t) {
      if (vids[t] || still()) { return; }
      var v = make('video', 'pt-vid');
      var V = { el: v, ok: false };
      vids[t] = V;
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.addEventListener('loadeddata', function () {
        V.ok = true;
        v.classList.add('ok');
        if (cur === t) { v.classList.add('on'); playV(v); }
      });
      v.addEventListener('error', function () {
        if (v.parentNode) { v.parentNode.removeChild(v); }
        V.ok = false; V.bad = true;
      });
      v.src = url(t, 'mp4');
      vidBox.appendChild(v);
    }
    function playV(v) {
      try { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } } catch (e) { /* no video */ }
    }

    function setTime(t, instant) {
      if (TIMES.indexOf(t) < 0 || t === cur) { return; }
      var old = cur;
      cur = t;
      stage.setAttribute('data-pt-time', t);
      if (instant) {
        stage.classList.add('pt-instant');
        ctx.timer(function () { stage.classList.remove('pt-instant'); }, 120);
      }
      TIMES.forEach(function (k) {
        grads[k].classList.toggle('on', k === t);
        var L = layers[k].el;
        if (k === t) { L.classList.remove('was'); L.classList.add('on'); }
        else if (k === old && !instant) {
          L.classList.remove('on'); L.classList.add('was');
          (function (node) { ctx.timer(function () { node.classList.remove('was'); }, FADE_MS + 200); }(L));
        } else { L.classList.remove('on'); L.classList.remove('was'); }
      });
      if (!still()) {
        tryVideo(t);
        TIMES.forEach(function (k) {
          var V = vids[k];
          if (!V) { return; }
          if (k === t) { if (V.ok) { V.el.classList.add('on'); playV(V.el); } }
          else {
            V.el.classList.remove('on');
            (function (vv) { ctx.timer(function () { if (cur !== vv.k) { try { vv.el.pause(); } catch (e) { /* ignore */ } } }, FADE_MS + 200); }({ k: k, el: V.el }));
          }
        });
      }
    }

    /* very slow breathing is CSS; pointer parallax is here */
    function onMove(e) {
      if (e.pointerType === 'touch' || still() || D.documentElement.getAttribute('data-motion') === 'reduced') { return; }
      var r = root.getBoundingClientRect();
      if (!r.width || !r.height) { return; }
      var nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      drift.style.setProperty('--pt-px', (-nx * 12).toFixed(1) + 'px');
      drift.style.setProperty('--pt-py', (-ny * 8).toFixed(1) + 'px');
    }
    function onLeave() {
      drift.style.setProperty('--pt-px', '0px');
      drift.style.setProperty('--pt-py', '0px');
    }
    if (!still()) {
      root.addEventListener('pointermove', onMove, { passive: true });
      root.addEventListener('pointerleave', onLeave);
    }

    ctx.onCleanup(function () {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      TIMES.forEach(function (k) {
        var V = vids[k];
        if (V) { try { V.el.pause(); V.el.removeAttribute('src'); V.el.load(); } catch (e) { /* ignore */ } }
      });
    });

    var handle = { stage: stage, setTime: function (t) { setTime(t, false); }, base: base, scene: scene };
    root.__pt = handle;
    setTime(ctx.time || P.state && P.state.time || base, true);
    return handle;
  }

  /* called from a scene's onTime(time, root) */
  function timeOf(root, time) {
    if (root && root.__pt) { root.__pt.setTime(time); }
  }

  P.paint = { mount: mount, setTime: timeOf, spots: spots, box: box, glow: glow, steam: steam, hint: setHint };
}());
