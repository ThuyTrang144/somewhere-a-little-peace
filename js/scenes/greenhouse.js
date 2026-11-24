/* The Greenhouse - glass, green, growing things. Prefix: gh-
   Painted backdrop (assets/art/greenhouse-*.jpg) + overlays. Tune everything in SPOTS / FX (% of the 16:9 stage). */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P || !P.paint) { return; }
  var U = P.util;

  /* Hotspots, in DOM order (later = on top). x,y = top-left, w,h = size, all in % of the stage. */
  var SPOTS = {
    pane1: { x: 12, y: 3,  w: 22, h: 16, hint: 'Touch the cool glass' },
    pane2: { x: 39, y: 3,  w: 22, h: 16, hint: 'Touch the cool glass' },
    pane3: { x: 66, y: 3,  w: 22, h: 16, hint: 'Touch the cool glass' },
    door:  { x: 44, y: 22, w: 12, h: 36, hint: 'Step out to the garden', go: 'garden' },
    side:  { x: 92, y: 25, w: 7,  h: 50, hint: 'Out to the sunset corner', go: 'sunset' },   /* not in the painting: kept for navigation */
    bud1:  { x: 20, y: 46, w: 6,  h: 8,  hint: 'Coax it open', cls: 'gh-bud' },
    bud2:  { x: 70, y: 44, w: 6,  h: 8,  hint: 'Coax it open', cls: 'gh-bud' },   /* bud2 is the watering target */
    bud3:  { x: 27, y: 58, w: 6,  h: 8,  hint: 'Coax it open', cls: 'gh-bud' },
    bud4:  { x: 62, y: 58, w: 6,  h: 8,  hint: 'Coax it open', cls: 'gh-bud' },
    can:   { x: 76, y: 66, w: 10, h: 12, hint: 'Water the orchid' }
  };

  /* Overlay effects. Boxes in % of the stage; "motes" in fractions (0..1). */
  var FX = {
    shafts:  { x: 20, y: 0,  w: 60, h: 78 },
    lantern: { x: 44, y: 8,  w: 12, h: 22 },
    stream:  { x: 73, y: 52, w: 0.5, h: 12 },      /* water falling onto the target pot */
    wet:     { x: 66, y: 44, w: 14, h: 16 },
    sparkle: { w: 7, h: 11 },                      /* size of the glow that opens a bud (centred on the bud) */
    petalFloor: 78,                                /* % y where petals come to rest */
    motes:   { x0: 0.2, x1: 0.82, y0: 0.05, y1: 0.92 }
  };

  var live = null;

  P.registerScene({
    id: 'greenhouse',
    name: 'The Greenhouse',
    tagline: 'glass, green, growing things',
    preferredTime: 'day',
    ambience: { birds: 0.3, forest: 0.25 },

    mount: function (root, ctx) {
      var pt = P.paint.mount(root, ctx, { scene: 'greenhouse', base: 'day' });
      var stage = pt.stage;
      var rm = ctx.reducedMotion;
      var sfx = function (nm) { var a = P.audio; if (a && a.sfx) { a.sfx(nm); } };

      /* ---- light ---- */
      var sh = P.paint.box(stage, 'gh-shafts', FX.shafts);
      sh.innerHTML = '<i class="gh-sh gh-sh1"></i><i class="gh-sh gh-sh2"></i><i class="gh-sh gh-sh3"></i>';
      P.paint.glow(stage, 'gh-lantern', FX.lantern, 'rgba(255,214,140,.8)');
      var wet = P.paint.glow(stage, 'gh-wet', FX.wet, 'rgba(210,235,240,.55)');
      var stream = P.paint.box(stage, 'gh-stream', FX.stream);

      var hs = P.paint.spots(stage, SPOTS, 'gh');
      var buds = [hs.bud1, hs.bud2, hs.bud3, hs.bud4];
      var target = hs.bud2;

      /* ---- buds: coax open (a soft glow), a second touch lets a petal fall ---- */
      var petals = [];
      function keyOf(b) { return b.className.match(/gh-hs-(\w+)/)[1]; }
      function dropPetal(b) {
        if (rm) { return; }
        var r = SPOTS[keyOf(b)];
        var p = document.createElement('i');
        p.className = 'gh-petal';
        p.setAttribute('aria-hidden', 'true');
        p.style.left = (r.x + r.w / 2) + '%'; p.style.top = (r.y + r.h / 3) + '%';
        p.style.setProperty('--dy', Math.max(4, FX.petalFloor - (r.y + r.h / 3)).toFixed(1) + 'vh');
        p.style.setProperty('--dx', U.rand(-3, 3).toFixed(1) + 'vw');
        stage.appendChild(p);
        petals.push(p);
        ctx.timer(function () { if (p.parentNode) { p.parentNode.removeChild(p); } }, 7200);
      }
      function bloomGlow(b) {
        var r = SPOTS[keyOf(b)];
        var g = P.paint.glow(stage, 'gh-sparkle', { x: r.x + r.w / 2 - FX.sparkle.w / 2, y: r.y + r.h / 2 - FX.sparkle.h / 2, w: FX.sparkle.w, h: FX.sparkle.h }, 'rgba(255,236,200,.85)');
        ctx.timer(function () { if (g.parentNode) { g.parentNode.removeChild(g); } }, 3200);
      }
      function openBud(b) {
        if (b.getAttribute('data-open')) { return; }
        b.setAttribute('data-open', '1');
        bloomGlow(b);
        P.paint.hint(b, 'A little bloom');
      }
      buds.forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.getAttribute('data-open')) { sfx('soft'); dropPetal(b); }
          else { openBud(b); sfx('soft'); }
        });
      });
      if (!rm) {
        ctx.timer(function () { openBud(buds[0]); }, 2500);
        ctx.every(function () {
          if (Math.random() < 0.3) {
            var b = U.pick(buds);
            if (b.getAttribute('data-open')) { dropPetal(b); }
            else { openBud(b); }
          }
        }, 14000);
      }

      /* ---- touch the glass: a droplet runs ---- */
      function runDrop(xPct, yPct) {
        var d = document.createElement('i');
        d.className = 'gh-drop';
        d.setAttribute('aria-hidden', 'true');
        d.style.left = xPct.toFixed(2) + '%'; d.style.top = yPct.toFixed(2) + '%';
        stage.appendChild(d);
        ctx.timer(function () { if (d.parentNode) { d.parentNode.removeChild(d); } }, rm ? 1800 : 3700);
      }
      ['pane1', 'pane2', 'pane3'].forEach(function (k) {
        hs[k].addEventListener('click', function (e) {
          var sr = stage.getBoundingClientRect(), xp, yp;
          if (e && e.detail > 0 && (e.clientX || e.clientY) && sr.width) {
            xp = (e.clientX - sr.left) / sr.width * 100; yp = (e.clientY - sr.top) / sr.height * 100;
          } else { xp = SPOTS[k].x + SPOTS[k].w / 2; yp = SPOTS[k].y + SPOTS[k].h / 3; }
          sfx('water');
          runDrop(xp, yp);
        });
      });

      /* ---- watering can ---- */
      var watering = false;
      hs.can.addEventListener('click', function () {
        if (watering) { return; }
        watering = true;
        sfx('water');
        wet.classList.add('gh-wetOn');
        if (rm) {
          openBud(target);
          ctx.timer(function () { watering = false; wet.classList.remove('gh-wetOn'); }, 4000);
          return;
        }
        stream.classList.remove('gh-go'); void stream.offsetWidth; stream.classList.add('gh-go');
        ctx.timer(function () { openBud(target); sfx('soft'); }, 3200);
        ctx.timer(function () { stream.classList.remove('gh-go'); watering = false; }, 5000);
        ctx.timer(function () { wet.classList.remove('gh-wetOn'); }, 22000);
      });

      /* ---- pollen on canvas ---- */
      var cv = U.canvas(stage, 'gh-motes'), c2 = cv.ctx2d, motes = [], i, lv = { warm: 0, cool: 0 };
      for (i = 0; i < 80; i++) {
        motes.push({ x: U.rand(FX.motes.x0, FX.motes.x1), y: U.rand(FX.motes.y0, FX.motes.y1), z: U.rand(0.4, 1.3), p: U.rand(0, 6.28), s: U.rand(0.003, 0.013) });
      }
      function draw(t, dt) {
        var w = cv.w(), h = cv.h(), sc = w / 1600, tm = document.documentElement.getAttribute('data-time') || 'day';
        var tw = tm === 'night' ? 0 : tm === 'dusk' ? 0.8 : 1, tc = tm === 'night' ? 0.7 : 0;
        var k = Math.min(1, (dt || 0.016) * 0.6), d = dt || 0;
        lv.warm += (tw - lv.warm) * k; lv.cool += (tc - lv.cool) * k;
        c2.clearRect(0, 0, w, h);
        for (var j = 0; j < motes.length; j++) {
          var m = motes[j];
          m.p += d * m.z * 0.5; m.y -= d * m.s * 0.5; m.x += Math.sin(m.p) * d * 0.004;
          if (m.y < FX.motes.y0) { m.y = FX.motes.y1; }
          if (m.x < FX.motes.x0) { m.x = FX.motes.x1; }
          if (m.x > FX.motes.x1) { m.x = FX.motes.x0; }
          var a = (0.5 + 0.5 * Math.sin(m.p * 1.7)) * 0.6 * m.z * (lv.warm * 0.9 + lv.cool * 0.45);
          if (a < 0.01) { continue; }
          c2.fillStyle = 'rgba(' + (lv.cool > lv.warm ? '214,230,255' : '255,244,206') + ',' + a.toFixed(3) + ')';
          c2.beginPath(); c2.arc(m.x * w, m.y * h, (1 + m.z * 1.7) * sc, 0, 6.2832); c2.fill();
        }
      }
      ctx.loop(draw);
      draw(0, 0.016);

      live = root;
      ctx.onCleanup(function () { if (live === root) { live = null; } });
    },

    onTime: function (time, root) {
      P.paint.setTime(root || live, time);
    }
  });
}());
