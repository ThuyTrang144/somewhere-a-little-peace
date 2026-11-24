/* The Sunset Corner - the day, letting go. Prefix: ss-
   Painted backdrop (assets/art/sunset-*.jpg) + overlays. Tune everything in SPOTS / FX (% of the 16:9 stage).
   The old firefly jar is not in the painting: the tall grass releases the fireflies. */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P || !P.paint) { return; }
  var U = P.util;

  var NEXT = { day: 'dusk', dusk: 'night', night: 'day' };
  var SKY_HINT = { day: 'Let the evening come', dusk: 'Let the stars come out', night: 'Let a new day begin' };

  /* Hotspots, in DOM order (later = on top). x,y = top-left, w,h = size, all in % of the stage. */
  var SPOTS = {
    sky:    { x: 0,  y: 12, w: 100, h: 30, hint: SKY_HINT.dusk },
    grass:  { x: 14, y: 80, w: 70,  h: 20, hint: 'Stir the tall grass' },
    lights: { x: 12, y: 4,  w: 76,  h: 12, hint: 'Light the little bulbs' },
    tea:    { x: 64, y: 60, w: 10,  h: 9,  hint: 'Pour the tea' },
    gate:   { x: 1,  y: 46, w: 9,   h: 32, hint: 'Step into the greenhouse', go: 'greenhouse' },
    path:   { x: 86, y: 60, w: 13,  h: 38, hint: 'Walk back to the garden', go: 'garden' }
  };

  /* Overlay effects. Boxes in % of the stage; "stars", "flies" are fractions (0..1) of the stage. */
  var FX = {
    sun:    { x: 28, y: 36, w: 44, h: 26 },
    bulbs:  { count: 11, x0: 14, x1: 86, y: 7, sag: 5, size: 3.2 },   /* string across the top: sagging line of glows */
    steam:  { x: 63, y: 49, w: 5, h: 11 },
    stream: { x: 65.5, y: 55, w: 0.4, h: 5 },
    meteor: { x: 10, y: 4, w: 80, h: 30 },
    stars:  { y0: 0.02, y1: 0.4, count: 70 },
    flies:  { y0: 0.56, y1: 0.94 }
  };

  /* ------------------------------------------------------------------ canvas: stars, dust, fireflies */

  function sky(stage, ctx) {
    var cv = U.canvas(stage, 'ss-fireflies');
    var g = cv.ctx2d;
    var spr = document.createElement('canvas'), sg, gr;
    spr.width = spr.height = 64; sg = spr.getContext('2d');
    gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(236,255,170,1)'); gr.addColorStop(0.18, 'rgba(214,240,120,.75)');
    gr.addColorStop(0.5, 'rgba(190,220,90,.22)'); gr.addColorStop(1, 'rgba(190,220,90,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    var mot = document.createElement('canvas'), mg, mgr;
    mot.width = mot.height = 32; mg = mot.getContext('2d');
    mgr = mg.createRadialGradient(16, 16, 0, 16, 16, 16);
    mgr.addColorStop(0, 'rgba(255,236,190,1)'); mgr.addColorStop(0.4, 'rgba(255,220,160,.5)'); mgr.addColorStop(1, 'rgba(255,220,160,0)');
    mg.fillStyle = mgr; mg.fillRect(0, 0, 32, 32);

    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var flies = [], motes = [], swirls = [], stars = [], i;
    for (i = 0; i < 44; i++) {
      flies.push({ nx: rnd(0.03, 0.97), ny: rnd(FX.flies.y0, FX.flies.y1), ax: rnd(0.012, 0.045), ay: rnd(0.012, 0.04), sx: rnd(0.12, 0.34), sy: rnd(0.1, 0.3),
        px: rnd(0, 6.3), py: rnd(0, 6.3), pf: rnd(0.5, 1.2), pp: rnd(0, 6.3), s: rnd(12, 24) });
    }
    for (i = 0; i < 28; i++) {
      motes.push({ nx: Math.random(), ny: rnd(0.25, 0.9), vx: rnd(0.002, 0.006), vy: rnd(-0.004, 0.001), s: rnd(3, 8), p: rnd(0, 6.3), pf: rnd(0.3, 0.9) });
    }
    for (i = 0; i < FX.stars.count; i++) {
      stars.push({ nx: rnd(0.02, 0.98), ny: rnd(FX.stars.y0, FX.stars.y1), s: rnd(2, 6), p: rnd(0, 6.3), pf: rnd(0.4, 1.4), b: rnd(0.4, 1) });
    }
    var vis = 0, visT = 0, mv = 0, mvT = 0, sv = 0.7, starV = 0, starT = 0;

    function setTime(t) {
      visT = t === 'night' ? 1 : (t === 'dusk' ? 0.12 : 0);
      sv = t === 'night' ? 1 : (t === 'dusk' ? 0.75 : 0.3);
      mvT = t === 'night' ? 0 : (t === 'dusk' ? 1 : 0.55);
      starT = t === 'night' ? 1 : (t === 'dusk' ? 0.18 : 0);
    }

    function draw(t, dt, snap) {
      var w = cv.w(), h = cv.h(), k = w / 1600, p, x, y, a, s2, j, q, ph;
      if (snap) { vis = visT; mv = mvT; starV = starT; }
      else {
        var e = Math.min(1, dt * 0.7);
        vis += (visT - vis) * e; mv += (mvT - mv) * e; starV += (starT - starV) * e;
      }
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      if (starV > 0.01) {
        for (j = 0; j < stars.length; j++) {
          q = stars[j];
          ph = 0.5 + 0.5 * Math.sin(t * q.pf + q.p);
          g.globalAlpha = starV * q.b * (0.3 + 0.7 * ph);
          s2 = q.s * k * (0.6 + 0.5 * ph);
          g.drawImage(mot, q.nx * w - s2 / 2, q.ny * h - s2 / 2, s2, s2);
        }
      }
      if (mv > 0.01) {
        for (j = 0; j < motes.length; j++) {
          q = motes[j];
          x = ((q.nx + t * q.vx) % 1 + 1) % 1 * w;
          y = (((q.ny + t * q.vy) % 1) + 1) % 1 * h + Math.sin(t * 0.4 + q.p) * 8;
          a = mv * (0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t * q.pf + q.p)));
          g.globalAlpha = a; s2 = q.s * k * 1.4;
          g.drawImage(mot, x - s2 / 2, y - s2 / 2, s2, s2);
        }
      }
      if (vis > 0.01) {
        for (j = 0; j < flies.length; j++) {
          p = flies[j];
          x = (p.nx + Math.sin(t * p.sx + p.px) * p.ax + Math.sin(t * p.sx * 0.37 + p.py) * p.ax * 0.5) * w;
          y = (p.ny + Math.cos(t * p.sy + p.py) * p.ay + Math.sin(t * p.sy * 0.53 + p.px) * p.ay * 0.4) * h;
          ph = 0.5 + 0.5 * Math.sin(t * p.pf + p.pp);
          a = vis * (0.1 + 0.9 * ph * ph);
          s2 = p.s * k * (0.7 + 0.5 * ph);
          g.globalAlpha = a;
          g.drawImage(spr, x - s2 / 2, y - s2 / 2, s2, s2);
        }
      }
      for (j = swirls.length - 1; j >= 0; j--) {
        q = swirls[j]; q.life += dt;
        if (q.life > q.max) { swirls.splice(j, 1); continue; }
        var u = q.life / q.max;
        q.a += dt * q.w;
        x = q.cx + Math.cos(q.a) * (14 + u * q.r);
        y = q.cy - u * q.rise + Math.sin(q.a * 0.8) * (8 + u * q.r * 0.5);
        ph = 0.5 + 0.5 * Math.sin(t * 1.3 + q.p);
        g.globalAlpha = sv * Math.sin(Math.PI * Math.min(1, u)) * (0.35 + 0.65 * ph);
        s2 = q.s * k * (0.7 + 0.4 * ph);
        g.drawImage(spr, x - s2 / 2, y - s2 / 2, s2, s2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    var tt = 0;
    return {
      setTime: setTime,
      loop: function (t, dt) { tt = t; draw(t, Math.min(dt, 0.1), false); },
      still: function () { draw(1.7, 0, true); },
      release: function (x, y) {
        var n = 0, room = 18 - swirls.length, c, k = cv.w() / 1600;
        for (c = 0; c < room && n < 14; c++, n++) {
          swirls.push({ cx: x + rnd(-14, 14), cy: y + rnd(-10, 10), a: rnd(0, 6.3), w: rnd(0.9, 2) * (Math.random() > 0.5 ? 1 : -1), r: rnd(40, 130) * k, rise: rnd(90, 230) * k,
            life: -rnd(0, 1.6), max: rnd(7, 11), s: rnd(14, 26), p: rnd(0, 6.3) });
        }
        if (swirls.length && ctx.reducedMotion) { draw(tt || 1.7, 0.016, false); }
      }
    };
  }

  /* ------------------------------------------------------------------ scene */

  var live = null;

  function audio(name) {
    try { if (P.audio && P.audio.sfx) { P.audio.sfx(name); } } catch (e) { /* silent */ }
  }

  P.registerScene({
    id: 'sunset',
    name: 'The Sunset Corner',
    tagline: 'the day, letting go',
    preferredTime: 'dusk',
    ambience: { wind: 0.3, night: 0.15 },

    mount: function (root, ctx) {
      var pt = P.paint.mount(root, ctx, { scene: 'sunset', base: 'dusk' });
      var stage = pt.stage;
      var time = ctx.time || 'dusk';
      var lightsOn = time !== 'day';
      var busy = false;
      var still = function () { return !!(P.state && P.state.reducedMotion); };

      /* ---- light overlays ---- */
      P.paint.glow(stage, 'ss-sun', FX.sun, 'rgba(255,190,120,.8)');
      var bulbs = [], bi, B = FX.bulbs;
      for (bi = 0; bi < B.count; bi++) {
        var u = bi / (B.count - 1);
        var bx = B.x0 + (B.x1 - B.x0) * u, by = B.y + B.sag * 4 * u * (1 - u);
        var bn = P.paint.glow(stage, 'ss-bulb', { x: bx - B.size / 2, y: by - B.size * 0.9, w: B.size, h: B.size * 1.78 }, 'rgba(255,214,140,.95)');
        bn.style.setProperty('--i', String(bi));
        bulbs.push(bn);
      }
      var steam = P.paint.steam(stage, FX.steam, 'ss-steam');
      steam.classList.add('on');
      var stream = P.paint.box(stage, 'ss-stream', FX.stream);
      var meteor = P.paint.box(stage, 'ss-meteor', FX.meteor);

      var hs = P.paint.spots(stage, SPOTS, 'ss');
      var fl = sky(stage, ctx);

      function paintLights() {
        root.setAttribute('data-lights', lightsOn ? 'on' : 'off');
        P.paint.hint(hs.lights, lightsOn ? 'Let the little lights rest' : 'Light the little bulbs');
      }
      function paintSky() { P.paint.hint(hs.sky, SKY_HINT[time] || 'Let the sky move on'); }
      function apply(t) {
        time = t;
        lightsOn = t !== 'day';
        paintLights(); paintSky();
        fl.setTime(t);
        if (still()) { fl.still(); }
      }
      apply(time);
      if (!still()) { ctx.loop(function (t, dt) { fl.loop(t, dt); }); }

      function later(fn, min, max) {
        ctx.timer(function () { fn(); later(fn, min, max); }, (min + Math.random() * (max - min)) * 1000);
      }
      function restart(el, cls, ms) {
        el.classList.remove(cls);
        void el.getBoundingClientRect();
        el.classList.add(cls);
        ctx.timer(function () { el.classList.remove(cls); }, ms);
      }

      function pour() {
        if (busy) { return; }
        busy = true;
        audio('pour');
        steam.classList.add('ss-strong');
        ctx.timer(function () { steam.classList.remove('ss-strong'); }, 16000);
        if (still()) { busy = false; return; }
        restart(stream, 'ss-go', 3800);
        ctx.timer(function () { busy = false; }, 3800);
      }
      function toggleLights() {
        lightsOn = !lightsOn;
        paintLights();
        audio('switch');
        if (!still()) {
          root.classList.remove('ss-rip'); void root.offsetWidth; root.classList.add('ss-rip');
          ctx.timer(function () { root.classList.remove('ss-rip'); }, 2600);
        }
      }
      function pointOf(node, e) {
        var sr = stage.getBoundingClientRect(), hr = node.getBoundingClientRect();
        if (e && e.detail > 0 && (e.clientX || e.clientY)) { return [e.clientX - sr.left, e.clientY - sr.top]; }
        return [hr.left + hr.width / 2 - sr.left, hr.top + hr.height / 2 - sr.top];
      }
      hs.lights.addEventListener('click', toggleLights);
      hs.tea.addEventListener('click', pour);
      hs.sky.addEventListener('click', function () {
        audio('soft');
        P.setTime(NEXT[(P.state && P.state.time) || time] || 'dusk');
      });
      hs.grass.addEventListener('click', function (e) {
        var pt2 = pointOf(hs.grass, e);
        fl.release(pt2[0], pt2[1]);
        audio('soft');
      });

      /* rare events */
      later(function () {
        if (still() || time !== 'night') { return; }
        meteor.style.setProperty('--sx', Math.round(U.rand(0, 30)) + '%');
        restart(meteor, 'ss-shoot', 1800);
      }, 40, 90);

      live = { onTime: apply, root: root };
      ctx.onCleanup(function () { live = null; });
    },

    onTime: function (time, root) {
      if (live) { P.paint.setTime(root || live.root, time); live.onTime(time); }
    }
  });
}());
