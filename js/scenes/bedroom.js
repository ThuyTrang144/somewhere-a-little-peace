/* The Bedroom - soft blankets, quiet night. Prefix: br-
   Painted backdrop (assets/art/bedroom-*.jpg) + overlays. Tune everything in SPOTS / FX (% of the 16:9 stage). */
(function () {
  'use strict';
  var P = window.Peace;
  if (!P || !P.paint) { return; }
  var U = P.util;

  /* Hotspots, in DOM order (later = on top). x,y = top-left, w,h = size, all in % of the stage.
     The old sun/moon ornament is not in the painting: the window does its job. */
  var SPOTS = {
    window: { x: 33, y: 8,  w: 34, h: 44, hint: 'Let the light change' },
    door:   { x: 2,  y: 18, w: 9,  h: 62, hint: 'Go downstairs', go: 'livingroom' },
    latch:  { x: 49, y: 49, w: 3,  h: 4,  hint: 'Listen to the rain' },
    lamp:   { x: 70, y: 40, w: 7,  h: 14, hint: 'Turn the lamp off' },
    radio:  { x: 78, y: 54, w: 6,  h: 6,  hint: 'Wind the music box' }
  };

  /* Overlay effects. Boxes in % of the stage; "glass" and "motes" are fractions (0..1). */
  var FX = {
    lampGlow:   { x: 62, y: 26, w: 24, h: 40 },
    windowGlow: { x: 31, y: 4,  w: 38, h: 50 },
    moonShaft:  { x: 34, y: 30, w: 36, h: 58 },
    sunShaft:   { x: 34, y: 30, w: 36, h: 58 },
    cupSteam:   { x: 73, y: 34, w: 4,  h: 9 },
    radioGlow:  { x: 76, y: 51, w: 10, h: 12 },
    shoot:      { x: 34, y: 10, w: 32, h: 20 },
    glass:      { x0: 0.34, y0: 0.1, x1: 0.66, y1: 0.5 },
    motes:      { x0: 0.28, x1: 0.82, y0: 0.15, y1: 0.82 }
  };

  var live = null;

  P.registerScene({
    id: 'bedroom',
    name: 'The Bedroom',
    tagline: 'soft blankets, quiet night',
    preferredTime: 'night',
    ambience: { night: 0.35, wind: 0.1 },

    mount: function (root, ctx) {
      var pt = P.paint.mount(root, ctx, { scene: 'bedroom', base: 'night' });
      var stage = pt.stage;
      var audio = function () { return P.audio; };
      var lampOn = ctx.time !== 'day', rainOn = false;

      /* ---- light overlays ---- */
      P.paint.glow(stage, 'br-windowglow', FX.windowGlow, 'rgba(255,238,190,.6)');
      P.paint.box(stage, 'br-moonshaft', FX.moonShaft);
      P.paint.box(stage, 'br-sunshaft', FX.sunShaft);
      P.paint.glow(stage, 'br-lampglow', FX.lampGlow, 'rgba(255,205,130,.8)');
      P.paint.steam(stage, FX.cupSteam, 'br-steam').classList.add('on');
      P.paint.glow(stage, 'br-radioglow', FX.radioGlow, 'rgba(255,225,170,.6)');
      var shoot = P.paint.box(stage, 'br-shoot', FX.shoot);

      var hs = P.paint.spots(stage, SPOTS, 'br');

      function setLamp(on) {
        lampOn = on;
        root.classList.toggle('br-lamp-on', on);
        P.paint.hint(hs.lamp, on ? 'Turn the lamp off' : 'Turn the lamp on');
      }
      function setRain(on) {
        rainOn = on;
        root.classList.toggle('br-rain', on);
        P.paint.hint(hs.latch, on ? 'Let the rain stop' : 'Listen to the rain');
        var a = audio();
        if (a && a.setAmbient) { a.setAmbient('rain', on ? 0.5 : 0); }
      }
      setLamp(lampOn);

      /* ---- hotspots ---- */
      hs.window.addEventListener('click', function () {
        var t = (P.state && P.state.time) || 'night';
        var a = audio();
        if (a && a.sfx) { a.sfx('soft'); }
        P.setTime(t === 'night' ? 'day' : 'night');
      });
      hs.lamp.addEventListener('click', function () {
        var a = audio(); if (a && a.sfx) { a.sfx('switch'); }
        setLamp(!root.classList.contains('br-lamp-on'));
      });
      hs.latch.addEventListener('click', function () {
        var a = audio(); if (a && a.sfx) { a.sfx('soft'); }
        setRain(!rainOn);
      });
      function radioPlaying() { var a = audio(); return !!(a && a.music && a.music.playing && a.music.id === 'instrumental'); }
      function syncRadio() { root.classList.toggle('br-radio-on', radioPlaying()); }
      hs.radio.addEventListener('click', function () {
        var a = audio(); if (!a) { return; }
        if (radioPlaying()) { if (a.pauseMusic) { a.pauseMusic(); } syncRadio(); return; }
        var go = function () { if (a.playMusic) { a.playMusic('instrumental'); } syncRadio(); };
        var p = a.unlock ? a.unlock() : null;
        if (p && p.then) { p.then(go, go); } else { go(); }
      });
      P.on('audio:change', syncRadio);
      ctx.onCleanup(function () { P.off('audio:change', syncRadio); });
      syncRadio();

      /* ---- canvas: rain on the glass + dust and pollen (design space 1600x900) ---- */
      var cv = U.canvas(stage, 'br-fx');
      var c2 = cv.ctx2d, motes = [], streaks = [], i, lv = { warm: 0, cool: 0, lamp: 0, rain: 0 };
      var GX0 = FX.glass.x0 * 1600, GX1 = FX.glass.x1 * 1600, GY0 = FX.glass.y0 * 900, GY1 = FX.glass.y1 * 900;
      for (i = 0; i < 70; i++) {
        motes.push({ x: U.rand(FX.motes.x0, FX.motes.x1), y: U.rand(FX.motes.y0, FX.motes.y1), z: U.rand(0.4, 1.3), p: U.rand(0, 6.28), s: U.rand(0.004, 0.014) });
      }
      function newStreak(s, init) {
        s.x = U.rand(GX0 - 10, GX1 + 10); s.y = init ? U.rand(GY0, GY1) : GY0 - U.rand(0, 30);
        s.v = U.rand(120, 260); s.l = U.rand(8, 20); s.a = U.rand(0.2, 0.45); s.drip = U.rand(0, 1) < 0.3;
      }
      for (i = 0; i < 26; i++) { var st = {}; newStreak(st, true); streaks.push(st); }
      function draw(t, dt) {
        var w = cv.w(), h = cv.h(), sc = w / 1600, tm = document.documentElement.getAttribute('data-time') || 'day';
        var tw = tm === 'night' ? 0 : tm === 'dusk' ? 0.8 : 1, tc = tm === 'night' ? 0.8 : 0.0;
        var tl = root.classList.contains('br-lamp-on') ? (tm === 'day' ? 0.3 : 1) : 0;
        var k = Math.min(1, (dt || 0.016) * 0.6), j;
        lv.warm += (tw - lv.warm) * k; lv.cool += (tc - lv.cool) * k; lv.lamp += (tl - lv.lamp) * k; lv.rain += ((rainOn ? 1 : 0) - lv.rain) * Math.min(1, (dt || 0.016) * 0.9);
        c2.clearRect(0, 0, w, h);
        if (lv.rain > 0.02) {
          c2.save();
          c2.beginPath(); c2.rect(GX0 * sc, GY0 * sc, (GX1 - GX0) * sc, (GY1 - GY0) * sc); c2.clip();
          c2.lineCap = 'round';
          for (j = 0; j < streaks.length; j++) {
            var s = streaks[j];
            s.y += s.v * (dt || 0) * 0.6; s.x -= s.v * 0.06 * (dt || 0);
            if (s.y > GY1 + 20) { newStreak(s, false); }
            c2.strokeStyle = 'rgba(214,228,240,' + (s.a * lv.rain).toFixed(3) + ')';
            c2.lineWidth = Math.max(0.6, 1 * sc);
            c2.beginPath(); c2.moveTo(s.x * sc, s.y * sc); c2.lineTo((s.x + s.l * 0.08) * sc, (s.y - s.l) * sc); c2.stroke();
            if (s.drip) {
              c2.fillStyle = 'rgba(235,244,252,' + (0.5 * lv.rain).toFixed(3) + ')';
              c2.beginPath(); c2.arc(s.x * sc, s.y * sc, 1.6 * sc, 0, 6.2832); c2.fill();
            }
          }
          c2.restore();
        }
        for (j = 0; j < motes.length; j++) {
          var m = motes[j];
          m.p += (dt || 0) * m.z * 0.5;
          m.y -= (dt || 0) * m.s * 0.6; m.x += Math.sin(m.p) * (dt || 0) * 0.004;
          if (m.y < FX.motes.y0) { m.y = FX.motes.y1; }
          if (m.x < FX.motes.x0) { m.x = FX.motes.x1; }
          if (m.x > FX.motes.x1) { m.x = FX.motes.x0; }
          var px = m.x * w, py = m.y * h;
          var lx = (FX.lampGlow.x + FX.lampGlow.w / 2) / 100, ly = (FX.lampGlow.y + FX.lampGlow.h / 2) / 100;
          var near = Math.max(0, 1 - Math.hypot((m.x - lx) * 1600, (m.y - ly) * 900) / 340);
          var a = (0.5 + 0.5 * Math.sin(m.p * 1.7)) * 0.55 * m.z;
          var al = a * (lv.warm * 0.9 + lv.cool * 0.5) + near * lv.lamp * 0.8 * a;
          if (al < 0.01) { continue; }
          var col = near * lv.lamp > lv.warm * 0.4 && near > 0.1 ? '255,226,160' : lv.cool > lv.warm ? '214,226,255' : '255,240,205';
          c2.fillStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
          c2.beginPath(); c2.arc(px, py, (1 + m.z * 1.6) * sc, 0, 6.2832); c2.fill();
        }
      }
      ctx.loop(draw);
      draw(0, 0.016);

      /* ---- rare events: a shooting star on clear nights ---- */
      if (!ctx.reducedMotion) {
        var tmNow = function () { return document.documentElement.getAttribute('data-time') || 'day'; };
        var sched = function (fn, lo, hi) { ctx.timer(function () { fn(); sched(fn, lo, hi); }, U.rand(lo, hi)); };
        sched(function () {
          if (tmNow() !== 'night' || rainOn) { return; }
          shoot.classList.remove('br-go'); void shoot.offsetWidth; shoot.classList.add('br-go');
          ctx.timer(function () { shoot.classList.remove('br-go'); }, 2400);
        }, 14000, 38000);
      }

      live = root;
      ctx.onCleanup(function () { if (live === root) { live = null; } });
    },

    onTime: function (time, root) {
      root = root || live;
      if (!root) { return; }
      P.paint.setTime(root, time);
      var on = time !== 'day';
      root.classList.toggle('br-lamp-on', on);
      var h = root.querySelector('.br-hs-lamp');
      if (h) { P.paint.hint(h, on ? 'Turn the lamp off' : 'Turn the lamp on'); }
    }
  });
}());
