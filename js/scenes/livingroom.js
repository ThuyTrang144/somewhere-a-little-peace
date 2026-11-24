/* The Living Room - firelight and rain on the glass. Prefix: lr-
   Painted backdrop (assets/art/livingroom-*.jpg) + overlays. Tune everything in SPOTS / FX (% of the 16:9 stage). */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P || !P.paint) { return; }
  var U = P.util;

  /* Hotspots, in DOM order (later = on top). x,y = top-left, w,h = size, all in % of the stage. */
  var SPOTS = {
    window: { x: 64, y: 12, w: 21, h: 44, hint: 'Let it snow' },
    stairs: { x: 85, y: 22, w: 7,  h: 56, hint: 'Go up to bed', go: 'bedroom' },
    tea:    { x: 93, y: 22, w: 6,  h: 60, hint: 'Through to the tea room', go: 'tearoom' },
    front:  { x: 0,  y: 25, w: 6,  h: 60, hint: 'Out to the garden', go: 'garden' },   /* not in the painting: kept for navigation */
    fire:   { x: 20, y: 40, w: 20, h: 28, hint: 'Stir the fire' },
    lamp:   { x: 46, y: 30, w: 7,  h: 42, hint: 'Switch the lamp' },
    cat:    { x: 30, y: 72, w: 13, h: 10, hint: 'Wake the cat, gently' }
  };

  /* Overlay effects. Boxes in % of the stage; "glass", "ember", "motes" are fractions (0..1) of the stage. */
  var FX = {
    fireGlow: { x: 14, y: 34, w: 32, h: 44 },
    roomWarm: { x: 0,  y: 0,  w: 100, h: 100 },
    lampGlow: { x: 41, y: 16, w: 18, h: 34 },
    dim:      { x: 0,  y: 0,  w: 100, h: 100 },
    mugSteam: { x: 47, y: 62, w: 5,  h: 10 },
    catHalo:  { x: 29, y: 70, w: 15, h: 12 },
    glass:    { x0: 0.655, y0: 0.15, x1: 0.845, y1: 0.54 },
    ember:    { x: 0.28, y: 0.6 },
    motes:    { x0: 0.4, x1: 0.8, y0: 0.28, y1: 0.8 }
  };

  var live = null;

  P.registerScene({
    id: 'livingroom',
    name: 'The Living Room',
    tagline: 'firelight and rain on the glass',
    preferredTime: 'night',
    ambience: { fire: 0.55, rain: 0.4 },
    mount: function (root, ctx) {
      var pt = P.paint.mount(root, ctx, { scene: 'livingroom', base: 'night' });
      var stage = pt.stage;
      var still = ctx.reducedMotion;
      var snd = function (n) { var a = P.audio; if (a && a.sfx) { a.sfx(n); } };
      var amb = function (id, v) { var a = P.audio; if (a && a.setAmbient) { a.setAmbient(id, v); } };
      var html = document.documentElement;

      /* ---- light overlays ---- */
      P.paint.glow(stage, 'lr-roomwarm', FX.roomWarm, 'rgba(255,150,70,.5)').style.borderRadius = '0';
      P.paint.glow(stage, 'lr-fireglow', FX.fireGlow, 'rgba(255,160,70,.75)');
      P.paint.glow(stage, 'lr-lampglow', FX.lampGlow, 'rgba(255,214,140,.7)');
      P.paint.box(stage, 'lr-dim', FX.dim);
      P.paint.steam(stage, FX.mugSteam, 'lr-steam').classList.add('on');
      var halo = P.paint.glow(stage, 'lr-halo', FX.catHalo, 'rgba(255,220,170,.6)');

      var hs = P.paint.spots(stage, SPOTS, 'lr');

      /* ---- toggles ---- */
      var lampOn = true, snowing = false, awakeT = null, fireT = null;
      hs.lamp.addEventListener('click', function () {
        lampOn = !lampOn;
        root.classList.toggle('lr-lampoff', !lampOn);
        snd('switch');
      });
      hs.window.addEventListener('click', function () {
        snowing = !snowing;
        root.classList.toggle('lr-snow', snowing);
        P.paint.hint(hs.window, snowing ? 'Let it rain' : 'Let it snow');
        if (snowing) { amb('rain', 0); amb('wind', 0.18); } else { amb('wind', 0); amb('rain', 0.4); }
        snd('soft');
      });

      /* ---- the fire: a log shifts, sparks rise ---- */
      var burst = 0;
      hs.fire.addEventListener('click', function () {
        snd('soft');
        if (!still) { burst = 22; }
        root.classList.remove('lr-stir');
        void root.offsetWidth;
        root.classList.add('lr-stir');
        if (fireT) { clearTimeout(fireT); }
        fireT = setTimeout(function () { root.classList.remove('lr-stir'); }, 2400);
      });

      /* ---- the cat ---- */
      var awake = false;
      hs.cat.addEventListener('click', function () {
        if (awake) { return; }
        awake = true;
        halo.classList.add('lr-awake');
        ctx.timer(function () { snd('purr'); }, still ? 0 : 1500);
        if (awakeT) { clearTimeout(awakeT); }
        awakeT = setTimeout(function () { halo.classList.remove('lr-awake'); awake = false; }, still ? 3000 : 7500);
      });
      ctx.onCleanup(function () { if (fireT) { clearTimeout(fireT); } if (awakeT) { clearTimeout(awakeT); } });

      /* ---- canvas: rain / snow on the glass, embers, motes (design space 1600x900, scaled to the stage) ---- */
      var cv = U.canvas(stage, 'lr-fx');
      var g = cv.ctx2d;
      var GX0 = FX.glass.x0 * 1600, GX1 = FX.glass.x1 * 1600, GY0 = FX.glass.y0 * 900, GY1 = FX.glass.y1 * 900;
      var EX = FX.ember.x * 1600, EY = FX.ember.y * 900;
      var streaks = [], drops = [], flakes = [], embers = [], motes = [], i;
      function newStreak(s, init) {
        s.x = U.rand(GX0 - 20, GX1 + 20); s.y = init ? U.rand(GY0, GY1) : GY0 - U.rand(0, 40);
        s.v = U.rand(210, 380); s.l = U.rand(9, 24); s.a = U.rand(0.18, 0.42);
      }
      function newDrop(d, init) {
        d.x = U.rand(GX0 + 4, GX1 - 4); d.y = init ? U.rand(GY0, GY1) : GY0 + U.rand(0, 30);
        d.v = 0; d.go = U.rand(0.2, 2.2); d.r = U.rand(1.3, 2.7); d.tail = 0; d.hold = U.rand(0.3, 3);
      }
      function newFlake(f, init) {
        f.x = U.rand(GX0, GX1); f.y = init ? U.rand(GY0, GY1) : GY0 - 6; f.v = U.rand(14, 34); f.r = U.rand(0.8, 2.6); f.ph = U.rand(0, 6.28); f.sw = U.rand(4, 12);
      }
      for (i = 0; i < 30; i++) { var s = {}; newStreak(s, true); streaks.push(s); }
      for (i = 0; i < 12; i++) { var d = {}; newDrop(d, true); drops.push(d); }
      for (i = 0; i < 34; i++) { var f = {}; newFlake(f, true); flakes.push(f); }
      for (i = 0; i < 22; i++) {
        motes.push({ x: U.rand(FX.motes.x0, FX.motes.x1) * 1600, y: U.rand(FX.motes.y0, FX.motes.y1) * 900, a: U.rand(0, 6.28), sp: U.rand(0.3, 0.8), r: U.rand(0.7, 1.7), ph: U.rand(0, 6.28) });
      }
      var rainA = 1, snowA = 0, emberT = 0;
      function spawnEmber(big) {
        if (embers.length > 44) { return; }
        embers.push({ x: EX + U.rand(-34, 34), y: EY + U.rand(-6, 8), vx: U.rand(-10, 10) * (big ? 2.2 : 1), vy: -U.rand(30, big ? 130 : 66), life: 0, max: U.rand(2.2, big ? 4.6 : 3.8), r: U.rand(1, big ? 2.6 : 2), ph: U.rand(0, 6.28) });
      }
      function draw(t, dt) {
        var W = cv.w(), sc = W / 1600;
        var tm = html.getAttribute('data-time'), night = tm === 'night' ? 1 : (tm === 'dusk' ? 0.6 : 0.25);
        var k;
        g.clearRect(0, 0, W, cv.h());
        rainA += ((snowing ? 0 : 1) - rainA) * Math.min(1, dt * 0.8);
        snowA += ((snowing ? 1 : 0) - snowA) * Math.min(1, dt * 0.8);
        /* glass */
        g.save();
        g.beginPath(); g.rect(GX0 * sc, GY0 * sc, (GX1 - GX0) * sc, (GY1 - GY0) * sc); g.clip();
        if (rainA > 0.02) {
          g.lineCap = 'round';
          for (k = 0; k < streaks.length; k++) {
            var st = streaks[k];
            st.y += st.v * dt; st.x -= st.v * 0.12 * dt;
            if (st.y > GY1 + 20) { newStreak(st, false); }
            g.strokeStyle = 'rgba(214,228,240,' + (st.a * rainA * (0.6 + 0.4 * (1 - night * 0.3))).toFixed(3) + ')';
            g.lineWidth = Math.max(0.6, 0.9 * sc);
            g.beginPath(); g.moveTo(st.x * sc, st.y * sc); g.lineTo((st.x + st.l * 0.12) * sc, (st.y - st.l) * sc); g.stroke();
          }
          for (k = 0; k < drops.length; k++) {
            var dr = drops[k];
            dr.hold -= dt;
            if (dr.hold <= 0) { dr.v = U.rand(14, 46); dr.hold = U.rand(0.5, 2.2); dr.go = U.rand(0.25, 1.1); }
            if (dr.go > 0) { dr.go -= dt; dr.y += dr.v * dt; dr.x += Math.sin(t * 2 + k) * 2 * dt; dr.tail = Math.min(34, dr.tail + dr.v * dt); }
            else { dr.v = 0; dr.tail = Math.max(0, dr.tail - 4 * dt); }
            if (dr.y > GY1 + 8) { newDrop(dr, false); }
            var px = dr.x * sc, py = dr.y * sc;
            if (dr.tail > 1) {
              var gr = g.createLinearGradient(px, py - dr.tail * sc, px, py);
              gr.addColorStop(0, 'rgba(220,234,246,0)'); gr.addColorStop(1, 'rgba(220,234,246,' + (0.32 * rainA).toFixed(3) + ')');
              g.strokeStyle = gr; g.lineWidth = dr.r * 0.8 * sc;
              g.beginPath(); g.moveTo(px, py - dr.tail * sc); g.lineTo(px, py); g.stroke();
            }
            g.fillStyle = 'rgba(230,240,250,' + (0.55 * rainA).toFixed(3) + ')';
            g.beginPath(); g.ellipse(px, py, dr.r * sc * 0.9, dr.r * sc * 1.25, 0, 0, 6.283); g.fill();
            g.fillStyle = 'rgba(255,255,255,' + (0.7 * rainA).toFixed(3) + ')';
            g.beginPath(); g.arc(px - dr.r * 0.3 * sc, py - dr.r * 0.4 * sc, dr.r * 0.35 * sc, 0, 6.283); g.fill();
          }
        }
        if (snowA > 0.02) {
          for (k = 0; k < flakes.length; k++) {
            var fl = flakes[k];
            fl.y += fl.v * dt; fl.x += Math.sin(t * 0.8 + fl.ph) * fl.sw * dt;
            if (fl.y > GY1 + 6) { newFlake(fl, false); }
            g.fillStyle = 'rgba(248,252,255,' + (Math.min(0.9, 0.35 + fl.r * 0.2) * snowA).toFixed(3) + ')';
            g.beginPath(); g.arc(fl.x * sc, fl.y * sc, fl.r * sc, 0, 6.283); g.fill();
          }
        }
        g.restore();
        /* embers + sparks */
        g.globalCompositeOperation = 'lighter';
        emberT += dt;
        if (burst > 0) { var nb = Math.min(burst, 4); for (k = 0; k < nb; k++) { spawnEmber(true); } burst -= nb; }
        if (emberT > 0.28) { emberT = 0; spawnEmber(false); }
        for (k = embers.length - 1; k >= 0; k--) {
          var e = embers[k];
          e.life += dt;
          if (e.life > e.max) { embers.splice(k, 1); continue; }
          e.x += (e.vx + Math.sin(t * 2.2 + e.ph) * 9) * dt; e.y += e.vy * dt; e.vy *= (1 - 0.18 * dt);
          var lf = e.life / e.max, al = (lf < 0.15 ? lf / 0.15 : 1 - (lf - 0.15) / 0.85);
          var ex = e.x * sc, ey = e.y * sc, er = e.r * sc;
          g.fillStyle = 'rgba(255,140,60,' + (al * 0.22).toFixed(3) + ')';
          g.beginPath(); g.arc(ex, ey, er * 3.2, 0, 6.283); g.fill();
          g.fillStyle = 'rgba(255,' + Math.round(200 - lf * 90) + ',' + Math.round(110 - lf * 60) + ',' + (al * 0.95).toFixed(3) + ')';
          g.beginPath(); g.arc(ex, ey, er, 0, 6.283); g.fill();
        }
        /* motes in the warm light */
        for (k = 0; k < motes.length; k++) {
          var m = motes[k];
          m.a += (Math.random() - 0.5) * 0.8 * dt;
          m.x += Math.cos(m.a) * m.sp * 7 * dt; m.y += Math.sin(m.a) * m.sp * 4 * dt - m.sp * 1.6 * dt;
          if (m.y < FX.motes.y0 * 900) { m.y = FX.motes.y1 * 900; }
          if (m.x < FX.motes.x0 * 1600) { m.x = FX.motes.x1 * 1600; }
          if (m.x > FX.motes.x1 * 1600) { m.x = FX.motes.x0 * 1600; }
          var ma = (0.12 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.6 + m.ph))) * (0.35 + 0.65 * night);
          g.fillStyle = 'rgba(255,214,150,' + ma.toFixed(3) + ')';
          g.beginPath(); g.arc(m.x * sc, m.y * sc, m.r * sc, 0, 6.283); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
      var clock = 0;
      ctx.loop(function (t, dt) { clock += dt; draw(clock, Math.min(dt, 0.05)); });
      if (still) { ctx.timer(function () { draw(1, 0.016); }, 80); }

      live = root;
      ctx.onCleanup(function () { if (live === root) { live = null; } });
    },
    onTime: function (time, root) {
      P.paint.setTime(root || live, time);
    }
  });
}());
