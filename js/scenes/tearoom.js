/* The Tea Room - warm cups, slow afternoons. Prefix: tr-
   Painted backdrop (assets/art/tearoom-*.jpg) + overlays. Tune everything in SPOTS / FX (% of the 16:9 stage). */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P || !P.paint) { return; }
  var U = P.util;

  /* Hotspots, in DOM order (later = on top). x,y = top-left, w,h = size, all in % of the stage. */
  var SPOTS = {
    window: { x: 33, y: 10, w: 34, h: 38, hint: 'Step out to the garden', go: 'garden' },
    door:   { x: 90, y: 30, w: 9,  h: 55, hint: 'Through to the living room', go: 'livingroom' },
    book:   { x: 8,  y: 80, w: 24, h: 16, hint: 'Turn a page' },
    vase:   { x: 71, y: 50, w: 9,  h: 25, hint: 'Brush the flowers' },
    cupA:   { x: 27, y: 70, w: 11, h: 12, hint: 'Take a sip' },
    cupB:   { x: 60, y: 68, w: 10, h: 11, hint: 'Take a sip' },
    pot:    { x: 43, y: 60, w: 14, h: 20, hint: 'Pour the tea' }
  };

  /* Overlay effects, same units. */
  var FX = {
    steamA:  { x: 28.5, y: 56, w: 8, h: 16 },
    steamB:  { x: 61.5, y: 54, w: 7, h: 15 },
    stream:  { x: 32,   y: 62, w: 0.5, h: 9 },      /* falls from the spout into cup A */
    splash:  { x: 30,   y: 70, w: 4,  h: 2 },
    pageSweep: { x: 8,  y: 80, w: 24, h: 16 },
    petalFrom: { x: 70, y: 50, w: 10, h: 6, to: 76 },    /* spawn box; "to" = floor y % */
    windowGlow: { x: 30, y: 4, w: 40, h: 46 },
    shafts:  { x: 30, y: 10, w: 52, h: 80 },
    motes:   { x0: 0.3, x1: 0.82, y0: 0.15, y1: 0.92 }  /* fractions of the stage */
  };

  var live = null;

  P.registerScene({
    id: 'tearoom',
    name: 'The Tea Room',
    tagline: 'warm cups, slow afternoons',
    preferredTime: 'day',
    ambience: { birds: 0.2, wind: 0.1 },
    mount: function (root, ctx) {
      var pt = P.paint.mount(root, ctx, { scene: 'tearoom', base: 'day' });
      var stage = pt.stage;
      var still = ctx.reducedMotion;
      var snd = function (n) { var a = P.audio; if (a && a.sfx) { a.sfx(n); } };
      var amb = function (id, v) { var a = P.audio; if (a && a.setAmbient) { a.setAmbient(id, v); } };

      /* ---- light: window glow + shafts (CSS fades them by data-time) ---- */
      P.paint.glow(stage, 'tr-windowglow', FX.windowGlow, 'rgba(255,238,190,.55)');
      var shafts = P.paint.box(stage, 'tr-shafts', FX.shafts);
      shafts.innerHTML = '<i class="tr-sh tr-sh1"></i><i class="tr-sh tr-sh2"></i><i class="tr-sh tr-sh3"></i>';

      /* ---- steam ---- */
      var cups = {
        A: { lvl: 0, steam: P.paint.steam(stage, FX.steamA, 'tr-steam'), amb: 'rain', on: false, vol: 0.35, t: 0 },
        B: { lvl: 0.8, steam: P.paint.steam(stage, FX.steamB, 'tr-steam'), amb: 'wind', on: false, vol: 0.3, t: 0 }
      };
      function steamOn(c, ms) {
        c.steam.classList.add('on');
        if (c.t) { clearTimeout(c.t); }
        c.t = setTimeout(function () { c.steam.classList.remove('on'); }, ms);
      }
      ctx.onCleanup(function () { if (cups.A.t) { clearTimeout(cups.A.t); } if (cups.B.t) { clearTimeout(cups.B.t); } });
      steamOn(cups.B, 150000);
      if (still) { cups.A.steam.classList.add('on'); }

      /* ---- pour effect ---- */
      var stream = P.paint.box(stage, 'tr-stream', FX.stream);
      var splash = P.paint.box(stage, 'tr-splash', FX.splash);
      var sweep = P.paint.box(stage, 'tr-sweep', FX.pageSweep);
      var hs = P.paint.spots(stage, SPOTS, 'tr');

      var busy = false;
      function doPour() {
        if (busy) { return; }
        busy = true;
        snd('pour');
        cups.A.lvl = 1;
        if (still) { steamOn(cups.A, 150000); busy = false; return; }
        stream.classList.remove('go'); splash.classList.remove('go');
        void stream.offsetWidth;
        stream.classList.add('go'); splash.classList.add('go');
        ctx.timer(function () { steamOn(cups.A, 150000); }, 2600);
        ctx.timer(function () { stream.classList.remove('go'); splash.classList.remove('go'); busy = false; }, 4200);
      }
      hs.pot.addEventListener('click', doPour);

      /* ---- sipping toggles a soft ambience ---- */
      function sip(c) {
        if (c.lvl < 0.12) { return; }
        snd('cup');
        c.lvl = Math.max(0, c.lvl - 0.2);
        steamOn(c, 60000);
        c.on = !c.on;
        amb(c.amb, c.on ? c.vol : 0);
      }
      hs.cupA.addEventListener('click', function () { sip(cups.A); });
      hs.cupB.addEventListener('click', function () { sip(cups.B); });

      /* ---- vase: a petal falls ---- */
      var petals = [];
      function dropPetal(quiet) {
        var f = FX.petalFrom;
        var x = f.x + U.rand(0, f.w), y = f.y + U.rand(0, f.h), dx = U.rand(-5, 5), dy = f.to - y + U.rand(-1, 2);
        var p = document.createElement('i');
        p.className = 'tr-petal';
        p.setAttribute('aria-hidden', 'true');
        p.style.left = x.toFixed(2) + '%'; p.style.top = y.toFixed(2) + '%';
        p.style.setProperty('--dx', dx.toFixed(2) + 'vw');
        p.style.setProperty('--dy', dy.toFixed(2) + 'vh');
        p.style.setProperty('--rot', Math.round(U.rand(-200, 200)) + 'deg');
        p.style.background = U.pick(['#d9a5a0', '#fbf5e9', '#ecd28a', '#e6b8b2']);
        stage.appendChild(p);
        petals.push(p);
        if (!quiet) { snd('soft'); }
        if (still) { p.style.transform = 'translate(' + dx + 'vw,' + dy + 'vh) rotate(40deg)'; }
        while (petals.length > 7) { var old = petals.shift(); if (old.parentNode) { old.parentNode.removeChild(old); } }
      }
      hs.vase.addEventListener('click', function () { dropPetal(false); });

      /* ---- book: a page turns (soft paper sweep) ---- */
      var turning = false;
      hs.book.addEventListener('click', function () {
        if (turning) { return; }
        turning = true;
        snd('page');
        if (still) { turning = false; return; }
        sweep.classList.remove('go'); void sweep.offsetWidth; sweep.classList.add('go');
        ctx.timer(function () { sweep.classList.remove('go'); turning = false; }, 1500);
      });

      /* ---- rare events ---- */
      function rare(fn, a, b) {
        if (still) { return; }
        (function next() { ctx.timer(function () { fn(); next(); }, U.rand(a, b) * 1000); }());
      }
      rare(function () { if (!busy) { dropPetal(true); } }, 28, 60);

      /* ---- dust motes in the light ---- */
      var cv = U.canvas(stage, 'tr-motes');
      var g = cv.ctx2d, motes = [], i;
      for (i = 0; i < 60; i++) {
        motes.push({ x: U.rand(FX.motes.x0, FX.motes.x1), y: U.rand(FX.motes.y0, FX.motes.y1), r: U.rand(0.7, 2), a: U.rand(0, 6.28), sp: U.rand(0.2, 0.6), ph: U.rand(0, 6.28), tw: U.rand(0.25, 0.8) });
      }
      var html = document.documentElement;
      function draw(t, dt) {
        var W = cv.w(), H = cv.h(), k = W / 1600;
        var tm = html.getAttribute('data-time'), f = tm === 'night' ? 0.2 : (tm === 'dusk' ? 0.7 : 1);
        g.clearRect(0, 0, W, H);
        for (var j = 0; j < motes.length; j++) {
          var m = motes[j];
          m.a += (Math.random() - 0.5) * 0.9 * dt;
          m.x += (Math.cos(m.a) * m.sp * 0.006 + 0.0007) * dt * 10;
          m.y += (Math.sin(m.a) * m.sp * 0.004 - m.sp * 0.0016) * dt * 10;
          if (m.x > FX.motes.x1) { m.x = FX.motes.x0; } if (m.x < FX.motes.x0 - 0.02) { m.x = FX.motes.x1; }
          if (m.y < FX.motes.y0) { m.y = FX.motes.y1; } if (m.y > FX.motes.y1 + 0.02) { m.y = FX.motes.y0; }
          var beam = 0.35 + 0.65 * Math.max(0, 1 - Math.abs(m.x - (0.5 + (m.y - 0.15) * 0.3)) / 0.22);
          var al = (0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * m.tw + m.ph))) * f * beam;
          var px = m.x * W, py = m.y * H, pr = m.r * k;
          g.fillStyle = 'rgba(255,236,190,' + (al * 0.22).toFixed(3) + ')';
          g.beginPath(); g.arc(px, py, pr * 3.2, 0, 6.283); g.fill();
          g.fillStyle = 'rgba(255,246,222,' + al.toFixed(3) + ')';
          g.beginPath(); g.arc(px, py, pr, 0, 6.283); g.fill();
        }
      }
      var clock = 0;
      ctx.loop(function (t, dt) { clock += dt; draw(clock, Math.min(dt, 0.05)); });
      if (still) { ctx.timer(function () { draw(2, 0); }, 60); }

      live = root;
      ctx.onCleanup(function () { if (live === root) { live = null; } });
    },
    onTime: function (time, root) {
      P.paint.setTime(root || live, time);
    }
  });
}());
