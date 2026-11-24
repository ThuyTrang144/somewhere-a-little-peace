/* Somewhere, A Little Peace - the garden (opening shot).
   The scenery is a painting (assets/art/garden-{day|dusk|night}.jpg, optional garden-{time}.mp4 loop).
   Code only adds overlays: butterflies, motes, fireflies, light shafts, leaf shadows, pond shimmer and ripples,
   chimney smoke, slow breathing + pointer parallax, and the hotspots. Prefix: gd-. */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P || typeof P.registerScene !== 'function') { return; }

  /* ---------------------------------------------------------------- config: everything in % of the 16:9 stage */
  var CFG = {
    artDir: 'assets/art/garden-',
    imgExt: '.jpg',
    vidExt: '.mp4',
    focusX: 0.6,                                         /* portrait crop keeps this fraction of the stage centred */
    times: ['day', 'dusk', 'night'],
    pond: { x: 62, y: 75, w: 24, h: 12 },                /* overlay area for shimmer + ripples */
    chimney: { x: 24, y: 15 },                           /* smoke origin */
    lawn: { x0: 8, x1: 92, y0: 46, y1: 86 },             /* where butterflies and fireflies roam */
    girl: { x: 71, y: 49 },
    glows: {                                             /* only shown when a painting for that time is missing */
      window: { x: 21, y: 42, r: 9 },
      door: { x: 33, y: 45, r: 7 },
      lantern: { x: 79, y: 52, r: 13 }
    },
    spots: [                                             /* x, y = centre, w, h = size, all in % of stage */
      { id: 'door', x: 33, y: 43, w: 7, h: 17, go: 'livingroom', hint: 'Go inside, by the fire', label: 'Cottage door, go inside by the fire' },
      { id: 'window', x: 21, y: 42, w: 8, h: 12, go: 'tearoom', hint: 'Pour a cup of tea', label: 'Cottage window with a teapot on the sill, go to the tea room' },
      { id: 'chimney', x: 24, y: 15, w: 5, h: 9, hint: 'Watch the smoke curl', label: 'Chimney, send up a little smoke' },
      { id: 'girl', x: 71, y: 49, w: 17, h: 28, hint: 'Say hello', label: 'The girl reading on the lounge chair, say hello' },
      { id: 'table', x: 79, y: 53, w: 9, h: 14, hint: 'Sip the iced tea', label: 'Side table with iced tea, a straw hat and a lantern' },
      { id: 'pond', x: 62, y: 75, w: 24, h: 13, hint: 'Touch the water', label: 'Pond, touch the water' },
      { id: 'greenhouse', x: 75, y: 36, w: 9, h: 12, go: 'greenhouse', hint: 'Step into the greenhouse', label: 'Glint of glass behind the trees, step into the greenhouse' },
      { id: 'path', x: 88, y: 57, w: 12, h: 10, go: 'sunset', hint: 'Walk to the sunset corner', label: 'Stepping-stone path, walk to the sunset corner' },
      { id: 'lawn', x: 20, y: 65, w: 18, h: 12, hint: 'Scatter the petals', label: 'Open lawn, send up a drift of petals' }
    ],
    girlLines: ['just one more page.', 'mm. hello.', 'it is a good book.', 'stay a while.'],
    tableLines: ['cold, and sweet.', 'lemon and mint.']
  };

  var NS = 'http://www.w3.org/2000/svg';

  function sfx(name) {
    try { if (P.audio && typeof P.audio.sfx === 'function') { P.audio.sfx(name); } } catch (e) { /* audio is optional */ }
  }
  function f1(v) { return Math.round(v * 10) / 10; }
  function pct(v) { return f1(v) + '%'; }

  /* ---------------------------------------------------------------- mount */
  function mount(root, ctx) {
    var U_ = P.util, rnd = U_.rand, pickOf = U_.pick, clamp = U_.clamp;
    var reduced = !!ctx.reducedMotion;
    var i;

    /* --- markup --- */
    var h = '<div class="gd-stage"><div class="gd-art"><div class="gd-breath" id="gd-breath"></div></div>';
    h += '<div class="gd-shafts" aria-hidden="true">';
    for (i = 0; i < 6; i++) {
      h += '<i style="left:' + pct(-6 + i * 11 + rnd(-3, 3)) + ';width:' + pct(rnd(5, 11)) + ';opacity:' + f1(rnd(0.45, 0.95)) + '"></i>';
    }
    h += '</div><div class="gd-leafsh" aria-hidden="true">';
    for (i = 0; i < 14; i++) {
      var left = i < 8;
      var lx = left ? rnd(-4, 36) : rnd(52, 100), ly = left ? rnd(60, 100) : rnd(52, 100), d = rnd(14, 26);
      h += '<i style="left:' + pct(lx) + ';top:' + pct(ly) + ';width:' + pct(rnd(9, 20)) + ';height:' + pct(rnd(7, 13)) + ';--dx:' + f1(rnd(-1.8, 1.8)) + '%;--dy:' + f1(rnd(-1, 1)) + '%;--d:' + f1(d) + 's;--l:-' + f1(rnd(0, d)) + 's"></i>';
    }
    h += '</div><div class="gd-glows" aria-hidden="true">';
    Object.keys(CFG.glows).forEach(function (k) {
      var g = CFG.glows[k];
      h += '<i class="gd-glow gd-glow-' + k + '" style="left:' + pct(g.x) + ';top:' + pct(g.y) + ';width:' + pct(g.r * 2) + ';padding-top:' + pct(g.r * 2) + '"></i>';
    });
    h += '</div>';
    var pd = CFG.pond;
    h += '<div class="gd-pondA" id="gd-pondA" aria-hidden="true" style="left:' + pct(pd.x - pd.w / 2) + ';top:' + pct(pd.y - pd.h / 2) + ';width:' + pct(pd.w) + ';height:' + pct(pd.h) + '">';
    for (i = 0; i < 12; i++) {
      var gdur = rnd(3, 7);
      h += '<b class="gd-glint" style="left:' + pct(rnd(8, 92)) + ';top:' + pct(rnd(12, 88)) + ';width:' + pct(rnd(4, 9)) + ';--d:' + f1(gdur) + 's;--l:-' + f1(rnd(0, gdur)) + 's"></b>';
    }
    for (i = 0; i < 4; i++) {
      var rd = rnd(10, 15);
      h += '<u class="gd-rip gd-ripS" style="left:' + pct(rnd(18, 82)) + ';top:' + pct(rnd(25, 75)) + ';--d:' + f1(rd) + 's;--l:-' + f1(rnd(0, rd)) + 's"></u>';
    }
    h += '</div><div class="gd-smoke" id="gd-smoke" aria-hidden="true" style="left:' + pct(CFG.chimney.x) + ';top:' + pct(CFG.chimney.y) + '">';
    for (i = 0; i < 7; i++) {
      var sd = rnd(12, 17);
      h += '<i style="--dx:' + f1(rnd(3, 9)) + 'vmin;--d:' + f1(sd) + 's;--l:-' + f1(i * sd / 7) + 's"></i>';
    }
    h += '</div><div class="gd-sky" id="gd-sky" aria-hidden="true"></div></div>';
    root.innerHTML = h;

    var stage = root.querySelector('.gd-stage'), art = root.querySelector('.gd-art'), breath = root.querySelector('#gd-breath');
    var pondA = root.querySelector('#gd-pondA'), smokeL = root.querySelector('#gd-smoke'), skyL = root.querySelector('#gd-sky');

    var cv = U_.canvas(root, 'gd-canvas');
    var top = document.createElement('div');
    top.className = 'gd-top';
    var th = '<div class="gd-spots" role="group" aria-label="Things to explore in the garden">';
    CFG.spots.forEach(function (s) {
      th += '<div class="hotspot gd-hs gd-hs-' + s.id + '" tabindex="0" role="button" aria-label="' + s.label + '" data-hint="' + s.hint + '"' +
        (s.go ? ' data-go="' + s.go + '"' : '') + ' style="left:' + pct(s.x - s.w / 2) + ';top:' + pct(s.y - s.h / 2) + ';width:' + pct(s.w) + ';height:' + pct(s.h) + '"><i class="gd-hglow"></i></div>';
    });
    th += '</div><div class="gd-line" id="gd-line" aria-live="polite"></div>';
    top.innerHTML = th;
    root.appendChild(top);
    var lineEl = top.querySelector('#gd-line');

    /* --- layout: a 16:9 box that covers the viewport, kept on the girl in portrait --- */
    var L = { s: 1, ox: 0, oy: 0, w: 1600, h: 900 };
    function layout() {
      var w = root.clientWidth || window.innerWidth, hh = root.clientHeight || window.innerHeight;
      var s = Math.max(w / 1600, hh / 900), sw_ = 1600 * s, sh = 900 * s;
      var ox = (w - sw_) / 2, oy = (hh - sh) / 2;
      if (sw_ > w) { ox = clamp(w * 0.5 - CFG.focusX * sw_, w - sw_, 0); }
      L.s = s; L.ox = ox; L.oy = oy; L.w = sw_; L.h = sh;
      [stage, top].forEach(function (e) {
        e.style.left = f1(ox) + 'px'; e.style.top = f1(oy) + 'px'; e.style.width = f1(sw_) + 'px'; e.style.height = f1(sh) + 'px';
        e.style.setProperty('--gd-w', f1(sw_) + 'px');
      });
    }
    layout();
    if (typeof window.ResizeObserver === 'function') {
      var ro = new window.ResizeObserver(layout);
      ro.observe(root);
      ctx.onCleanup(function () { ro.disconnect(); });
    } else {
      window.addEventListener('resize', layout);
      ctx.onCleanup(function () { window.removeEventListener('resize', layout); });
    }

    /* --- the painting: three stacked images, missing ones fall back to the day image with a tint --- */
    var imgs = {}, vids = {}, dayURL = CFG.artDir + 'day' + CFG.imgExt;
    function ensureImg(t) {
      if (imgs[t]) { return; }
      var im = document.createElement('img');
      im.className = 'gd-img gd-img-' + t;
      im.alt = ''; im.draggable = false; im.decoding = 'async';
      im.addEventListener('error', function () {
        if (t === 'day' || im.getAttribute('data-fb')) { return; }
        im.setAttribute('data-fb', '1');
        im.classList.add('gd-tint-' + t);
        stage.classList.add('gd-miss-' + t);
        im.src = dayURL;
      });
      im.src = CFG.artDir + t + CFG.imgExt;
      breath.appendChild(im);
      imgs[t] = im;
    }
    function ensureVid(t) {
      if (reduced || vids[t] !== undefined) { return; }
      var v = document.createElement('video');
      v.className = 'gd-vid gd-vid-' + t;
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.addEventListener('canplay', function () {
        v.classList.add('gd-on');
        if (P.state.time === t) { try { var pr = v.play(); if (pr && pr.catch) { pr.catch(function () {}); } } catch (e) { /* autoplay refused */ } }
      });
      v.addEventListener('error', function () {
        vids[t] = null;
        if (v.parentNode) { v.parentNode.removeChild(v); }
      });
      v.src = CFG.artDir + t + CFG.vidExt;
      breath.appendChild(v);
      vids[t] = v;
    }
    function syncVideos(time) {
      CFG.times.forEach(function (t) {
        var v = vids[t];
        if (!v) { return; }
        try {
          if (t === time && v.classList.contains('gd-on')) { var pr = v.play(); if (pr && pr.catch) { pr.catch(function () {}); } } else if (t !== time) { v.pause(); }
        } catch (e) { /* ignore */ }
      });
    }
    ensureImg('day');
    var cur = P.state.time || 'day';
    ensureImg(cur);
    CFG.times.forEach(function (t) { ctx.timer(function () { ensureImg(t); }, 3500); });
    ensureVid(cur);
    CFG.times.forEach(function (t) { if (t !== cur) { ctx.timer(function () { ensureVid(t); }, 6000); } });
    ctx.onCleanup(function () {
      CFG.times.forEach(function (t) { var v = vids[t]; if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } } });
    });

    /* --- pointer parallax (the whole painting drifts a few pixels) --- */
    var par = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!reduced) {
      var onMove = function (ev) {
        var w = root.clientWidth || 1, hh = root.clientHeight || 1;
        par.tx = ((ev.clientX / w) - 0.5) * -2; par.ty = ((ev.clientY / hh) - 0.5) * -2;
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      ctx.onCleanup(function () { window.removeEventListener('pointermove', onMove); });
    }

    /* --- small helpers --- */
    function later(fn, ms) { ctx.timer(fn, ms); }
    function stagePoint(ev) {
      if (!ev || (!ev.clientX && !ev.clientY)) { return null; }
      var r = stage.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width * 100, y: (ev.clientY - r.top) / r.height * 100 };
    }
    var lineTimer = 0;
    function say(text, x, y) {
      lineEl.textContent = text;
      lineEl.style.left = pct(x); lineEl.style.top = pct(y);
      lineEl.classList.remove('gd-show');
      void lineEl.offsetWidth;
      lineEl.classList.add('gd-show');
      lineTimer++;
      var mine = lineTimer;
      later(function () { if (mine === lineTimer) { lineEl.classList.remove('gd-show'); } }, 4200);
    }

    var ripCount = 0;
    function ripple(xp, yp, scale) {
      if (ripCount > 9) { return; }
      var k;
      for (k = 0; k < 3; k++) {
        (function (k) {
          var e = document.createElement('u');
          e.className = 'gd-rip gd-ripN';
          e.style.cssText = 'left:' + pct(xp) + ';top:' + pct(yp) + ';--l:' + f1(k * 0.42) + 's;--sc:' + f1(scale);
          pondA.appendChild(e);
          ripCount++;
          later(function () { if (e.parentNode) { e.parentNode.removeChild(e); } ripCount--; }, 3700 + k * 420);
        })(k);
      }
    }
    var petCount = 0;
    function petal(xp, yp, dx, dy, d, col) {
      if (petCount > 70) { return; }
      var e = document.createElement('i');
      e.className = 'gd-petal';
      e.style.cssText = 'left:' + pct(xp) + ';top:' + pct(yp) + ';background:' + col + ';--dx:' + f1(dx) + ';--dy:' + f1(dy) + ';--r:' + Math.round(rnd(-320, 320)) + 'deg;--d:' + f1(d) + 's;--sz:' + f1(rnd(0.7, 1.15));
      skyL.appendChild(e);
      petCount++;
      later(function () { if (e.parentNode) { e.parentNode.removeChild(e); } petCount--; }, d * 1000 + 300);
    }
    var PET = ['#e6b7b2', '#f0d0cc', '#d9a5a0', '#f8f2e4', '#ecd28a', '#cfa3b8'];
    function bird() {
      var e = document.createElement('div'), d = rnd(15, 22);
      e.className = 'gd-bird';
      e.style.cssText = 'top:' + pct(rnd(8, 22)) + ';--d:' + f1(d) + 's';
      e.innerHTML = '<svg viewBox="-12 -8 24 12" aria-hidden="true"><g class="gd-bwing"><path d="M-9,1Q-4.5,-5 0,0Q4.5,-5 9,1" stroke="#4a3f3a" stroke-width="1.6" fill="none" stroke-linecap="round"/></g></svg>';
      skyL.appendChild(e);
      later(function () { if (e.parentNode) { e.parentNode.removeChild(e); } }, d * 1000 + 300);
    }

    /* --- interactions (hotspot data-go is handled by core) --- */
    function on(id, fn) {
      var e = top.querySelector('.gd-hs-' + id);
      if (e) { e.addEventListener('click', fn); }
    }
    on('pond', function (ev) {
      var r = pondA.getBoundingClientRect(), xp, yp;
      if (ev.clientX || ev.clientY) {
        xp = (ev.clientX - r.left) / r.width * 100; yp = (ev.clientY - r.top) / r.height * 100;
      } else { xp = rnd(30, 70); yp = rnd(35, 65); }
      ripple(clamp(xp, 12, 88), clamp(yp, 20, 80), 1);
      sfx('water');
    });
    on('lawn', function (ev) {
      var p = stagePoint(ev) || { x: CFG.spots[8].x + rnd(-6, 6), y: CFG.spots[8].y };
      var k;
      for (k = 0; k < 16; k++) { petal(p.x + rnd(-5, 5), p.y + rnd(-3, 2), rnd(-6, 8), rnd(-24, -12), rnd(4.5, 7.5), pickOf(PET)); }
      sfx('soft');
    });
    on('girl', function () {
      sfx('page');
      say(pickOf(CFG.girlLines), CFG.girl.x - 8, CFG.girl.y - 22);
    });
    on('table', function () {
      sfx('cup');
      say(pickOf(CFG.tableLines), CFG.spots[4].x - 6, CFG.spots[4].y - 14);
    });
    on('chimney', function () {
      var k;
      for (k = 0; k < 4; k++) {
        (function () {
          var e = document.createElement('i'), d = rnd(6, 9);
          e.style.cssText = '--dx:' + f1(rnd(3, 9)) + 'vmin;--d:' + f1(d) + 's;--l:0s;animation-iteration-count:1;animation-delay:' + f1(k * 0.4) + 's';
          smokeL.appendChild(e);
          later(function () { if (e.parentNode) { e.parentNode.removeChild(e); } }, d * 1000 + 1800);
        })();
      }
      sfx('soft');
    });

    /* --- rare events (skipped under reduced motion) --- */
    function sched(fn, lo, hi) {
      ctx.timer(function () { fn(); sched(fn, lo, hi); }, rnd(lo, hi) * 1000);
    }
    if (!reduced) {
      sched(bird, 40, 90);
      sched(function () { ripple(rnd(25, 75), rnd(30, 70), rnd(0.55, 0.9)); }, 15, 30);
      sched(function () {
        petal(rnd(60, 92), rnd(14, 30), rnd(-14, -4), rnd(34, 50), rnd(9, 13), pickOf(['#f8f2e4', '#e6b7b2', '#f0d0cc']));
      }, 12, 25);
    }

    /* --- canvas: pollen, butterflies, fireflies. Positions are in 1600x900 stage units. --- */
    var g2 = cv.ctx2d;
    function sprite(sz, stops) {
      var c = document.createElement('canvas'); c.width = c.height = sz;
      var q = c.getContext('2d'), gr = q.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
      q.fillStyle = gr; q.fillRect(0, 0, sz, sz);
      return c;
    }
    var spFly = sprite(48, [[0, 'rgba(244,255,194,1)'], [0.22, 'rgba(213,236,138,.55)'], [1, 'rgba(155,198,106,0)']]);
    var spPol = sprite(24, [[0, 'rgba(255,246,214,.95)'], [0.4, 'rgba(255,240,200,.35)'], [1, 'rgba(255,240,200,0)']]);
    var LW = CFG.lawn, lx0 = LW.x0 * 16, lx1 = LW.x1 * 16, ly0 = LW.y0 * 9, ly1 = LW.y1 * 9;

    var pol = [], fly = [], bfs = [];
    for (i = 0; i < 56; i++) { pol.push({ x: rnd(0, 1600), y: rnd(60, 860), vx: rnd(4, 14), vy: rnd(-3, 5), ph: rnd(0, 6.28), sz: rnd(5, 11), a: rnd(0.25, 0.75), fr: rnd(0.3, 0.9) }); }
    for (i = 0; i < 36; i++) { fly.push({ x: rnd(lx0, lx1), y: rnd(ly0, ly1), vx: rnd(-10, 10), vy: rnd(-10, 10), ph: rnd(0, 6.28), sp: rnd(0.6, 1.5), sz: rnd(16, 28) }); }
    var BCOL = [['#f6e7a3', '#e9c86a'], ['#f4f0ea', '#c9d6e8'], ['#c9bfe6', '#9aa6d6']];
    for (i = 0; i < 3; i++) {
      bfs.push({ x: rnd(lx0, lx1), y: rnd(ly0, ly1), vx: 0, vy: 0, ph: rnd(0, 6), mode: 'wander', tx: 0, ty: 0, t: 0, wp: null, tilt: 0, c1: BCOL[i][0], c2: BCOL[i][1], sz: 1 + i * 0.12 });
    }
    function nightTarget() { var t = P.state.time; return t === 'night' ? 1 : (t === 'dusk' ? 0.25 : 0); }
    var nf = nightTarget();

    function chooseTarget(b) {
      b.t = rnd(2.5, 5.5); b.mode = 'wander';
      b.tx = rnd(lx0, lx1); b.ty = rnd(ly0 - 40, ly1);
    }
    function startPass(b) {
      var gx = CFG.girl.x * 16, gy = CFG.girl.y * 9;
      b.mode = 'pass';
      b.x = 1680; b.y = gy - rnd(60, 120);
      b.wp = [[gx + 320, gy - 90], [gx + 120, gy - 70], [gx - 100, gy - 100], [gx - 380, gy - 60], [-80, gy - 140]];
      b.tx = b.wp[0][0]; b.ty = b.wp[0][1];
    }
    function stepB(b, dt) {
      var sp = 62, dx, dy, d;
      b.ph += dt * rnd(15, 19);
      dx = b.tx - b.x; dy = b.ty - b.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
      var want = b.mode === 'pass' ? 120 : sp;
      b.vx += (dx / d * want - b.vx) * Math.min(1, dt * 1.6);
      b.vy += (dy / d * want + Math.sin(b.ph * 0.31) * 26 - b.vy) * Math.min(1, dt * 1.6);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.tilt = clamp(b.vx * 0.004, -0.4, 0.4);
      if (b.mode === 'pass') {
        if (d < 40) {
          b.wp.shift();
          if (!b.wp.length) { b.x = rnd(lx1 - 100, lx1); b.y = rnd(ly0, ly1); chooseTarget(b); } else { b.tx = b.wp[0][0]; b.ty = b.wp[0][1]; }
        }
      } else {
        b.t -= dt;
        if (d < 25 || b.t <= 0) { chooseTarget(b); }
      }
    }
    function drawB(b, still) {
      var X = L.ox + b.x * L.s, Y = L.oy + b.y * L.s, sc = L.s * b.sz * 1.15;
      var flap = still ? 0.7 : Math.abs(Math.cos(b.ph)), side;
      g2.save(); g2.translate(X, Y); g2.rotate(b.tilt); g2.scale(sc, sc);
      for (side = -1; side <= 1; side += 2) {
        g2.save(); g2.scale(side * (0.12 + flap * 0.88), 1);
        g2.fillStyle = b.c1;
        g2.beginPath(); g2.moveTo(0, -1); g2.bezierCurveTo(5, -13, 16, -14, 14.5, -5); g2.bezierCurveTo(13, 0, 6, 1, 0, 1); g2.fill();
        g2.fillStyle = b.c2;
        g2.beginPath(); g2.moveTo(0, 0); g2.bezierCurveTo(8, 0, 12.5, 6, 8.5, 10.5); g2.bezierCurveTo(4, 12.5, 1, 6, 0, 2); g2.fill();
        g2.fillStyle = 'rgba(70,50,40,.35)';
        g2.beginPath(); g2.arc(9.5, -6, 1.7, 0, 6.283); g2.fill();
        g2.restore();
      }
      g2.strokeStyle = '#4a3a30'; g2.lineWidth = 1.5; g2.lineCap = 'round';
      g2.beginPath(); g2.moveTo(0, -4); g2.lineTo(0, 7); g2.moveTo(0, -4); g2.lineTo(-3, -9); g2.moveTo(0, -4); g2.lineTo(3, -9); g2.stroke();
      g2.restore();
    }

    function draw(dt, still) {
      var w = cv.w(), hh = cv.h(), k, p, a, X, Y;
      g2.clearRect(0, 0, w, hh);
      nf += (nightTarget() - nf) * Math.min(1, dt * 0.9);
      var day = 1 - nf;
      if (day > 0.02) {
        for (k = 0; k < pol.length; k++) {
          p = pol[k];
          if (!still) {
            p.ph += dt * p.fr;
            p.x += (p.vx + Math.sin(p.ph) * 8) * dt; p.y += (p.vy + Math.cos(p.ph * 0.8) * 5) * dt;
            if (p.x > 1640) { p.x = -30; } if (p.y > 880) { p.y = 60; } if (p.y < 50) { p.y = 880; }
          }
          a = p.a * day * (0.6 + 0.4 * Math.sin(p.ph * 2.1));
          X = L.ox + p.x * L.s; Y = L.oy + p.y * L.s;
          g2.globalAlpha = clamp(a, 0, 1);
          g2.drawImage(spPol, X - p.sz * L.s * 0.5, Y - p.sz * L.s * 0.5, p.sz * L.s, p.sz * L.s);
        }
      }
      if (day > 0.12) {
        for (k = 0; k < bfs.length; k++) {
          if (!still) { stepB(bfs[k], dt); }
          g2.globalAlpha = clamp((day - 0.12) * 1.3, 0, 1);
          drawB(bfs[k], still);
        }
      }
      if (nf > 0.03) {
        g2.globalCompositeOperation = 'lighter';
        for (k = 0; k < fly.length; k++) {
          p = fly[k];
          if (!still) {
            p.ph += dt * p.sp;
            p.vx += (Math.sin(p.ph * 1.7 + k) * 14 - p.vx * 0.4) * dt * 2; p.vy += (Math.cos(p.ph * 1.3 + k * 2) * 12 - p.vy * 0.4) * dt * 2;
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.x < lx0) { p.vx = Math.abs(p.vx); } if (p.x > lx1) { p.vx = -Math.abs(p.vx); }
            if (p.y < ly0) { p.vy = Math.abs(p.vy); } if (p.y > ly1) { p.vy = -Math.abs(p.vy); }
          }
          a = still ? 0.55 * nf : Math.pow(Math.max(0, Math.sin(p.ph * 2.2 + k * 1.7)), 3) * nf;
          if (a < 0.02) { continue; }
          X = L.ox + p.x * L.s; Y = L.oy + p.y * L.s;
          g2.globalAlpha = clamp(a, 0, 1);
          g2.drawImage(spFly, X - p.sz * L.s * 0.5, Y - p.sz * L.s * 0.5, p.sz * L.s, p.sz * L.s);
        }
        g2.globalCompositeOperation = 'source-over';
      }
      g2.globalAlpha = 1;
    }

    for (i = 0; i < bfs.length; i++) { chooseTarget(bfs[i]); }
    if (reduced) {
      draw(0.016, true);
    } else {
      ctx.loop(function (t, dt) {
        par.x += (par.tx - par.x) * Math.min(1, dt * 1.5); par.y += (par.ty - par.y) * Math.min(1, dt * 1.5);
        art.style.transform = 'translate3d(' + f1(par.x * L.w * 0.004) + 'px,' + f1(par.y * L.h * 0.004) + 'px,0)';
        draw(dt, false);
      });
      var passT = function () {
        var b = bfs[0];
        if (b.mode !== 'pass') { startPass(b); }
        ctx.timer(passT, rnd(35, 70) * 1000);
      };
      ctx.timer(passT, rnd(18, 30) * 1000);
    }

    root._gdTime = function (time) {
      ensureImg(time);
      ensureVid(time);
      syncVideos(time);
      if (reduced) { nf = nightTarget(); draw(0.016, true); }
    };
    syncVideos(cur);
  }

  function onTime(time, root) {
    if (root && typeof root._gdTime === 'function') { root._gdTime(time); }
  }

  P.registerScene({
    id: 'garden',
    name: 'The Garden',
    tagline: 'slow down, you are home',
    preferredTime: 'day',
    ambience: { birds: 0.45, wind: 0.2 },
    mount: mount,
    onTime: onTime
  });
})();
