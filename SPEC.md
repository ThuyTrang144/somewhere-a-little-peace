# Somewhere, A Little Peace — build spec

An immersive animated healing sanctuary. Not a landing page, not a meditation app, not SaaS.
The visitor steps into a small, quiet world that feels like a frame from a gentle animated countryside film,
and is invited to stay. Success = the visitor says "wow", then stops clicking and simply sits there.

Every agent reads this whole file first. Sections 1-4 are binding contracts. Section 5+ is per-file work.

---

## 1. Tech and file ownership

Plain HTML + CSS + classic (non-module) JavaScript. No build step, no framework, no npm, no image or audio files.
Everything is drawn in code (inline SVG, CSS, canvas) and all sound is synthesized with the Web Audio API.
The site must work when `index.html` is opened directly from disk and from a static server.

```
index.html                    agent SHELL
css/base.css                  agent SHELL
js/core.js                    agent SHELL
js/ui.js                      agent SHELL
js/audio.js                   agent AUDIO
js/scenes/garden.js      + css/scenes/garden.css       agent GARDEN
js/scenes/tearoom.js     + css/scenes/tearoom.css      agent ROOMS
js/scenes/livingroom.js  + css/scenes/livingroom.css   agent ROOMS
js/scenes/bedroom.js     + css/scenes/bedroom.css      agent REST
js/scenes/greenhouse.js  + css/scenes/greenhouse.css   agent REST
js/scenes/sunset.js      + css/scenes/sunset.css       agent DUSK
```

Write only your own files. Never edit another agent's file. If the contract seems to be missing something,
solve it inside your own files and mention it in your final report.

`index.html` loads, in this order, all with `defer`:
`js/core.js`, `js/audio.js`, the six scene files (garden, tearoom, livingroom, bedroom, greenhouse, sunset), `js/ui.js`.
It links `css/base.css` and then the six scene stylesheets.
`core.js` boots on `DOMContentLoaded` (after every deferred script has run).

Every script is wrapped in an IIFE with `'use strict'`. The only global is `window.Peace`.
Before finishing, run `node --check <file>` on every JS file you wrote.

---

## 2. The `window.Peace` contract

Created by `core.js`. Other files only add to it as described here.

```js
Peace.registerScene(def)          // called by each scene file at load time
Peace.go(sceneId)                 // transition to a scene (no-op if already there or mid-transition)
Peace.setTime(time)               // 'day' | 'dusk' | 'night'
Peace.state                       // { scene: id|null, time: 'day', reducedMotion: bool, entered: bool }
Peace.on(event, fn) / Peace.off(event, fn) / Peace.emit(event, data)
Peace.util                        // helpers, below
Peace.audio                       // added by audio.js, section 4
Peace.sceneOrder                  // ['garden','tearoom','livingroom','bedroom','greenhouse','sunset']
```

Events emitted by core: `scene:leave {id}`, `scene:enter {id, def}`, `time {time}`, `entered` (visitor left the intro).
Events emitted by audio: `audio:change`.

### Scene definition

```js
Peace.registerScene({
  id: 'tearoom',                              // one of sceneOrder
  name: 'The Tea Room',                       // shown on the title card and the map
  tagline: 'warm cups, slow afternoons',      // lowercase, short, no full stop
  preferredTime: 'day',                       // applied on enter unless the visitor chose a time by hand
  ambience: { birds: 0.25, wind: 0.15 },      // default ambient mix for this place, 0..1 per ambient id
  mount(root, ctx) { ... },                   // build the scene inside root
  onTime(time, root) { ... }                  // optional, called after the global time changes
});
```

`root` is an empty `<section class="scene scene-{id}" data-scene="{id}">` that core has already sized to the viewport
(`position:absolute; inset:0; overflow:hidden`). Core removes it after the leave transition.

`ctx`:
- `ctx.time` - current time string at mount.
- `ctx.reducedMotion` - boolean.
- `ctx.loop(fn)` - register `fn(t, dt)` (seconds) on a shared requestAnimationFrame loop. Paused while the tab is
  hidden, stopped at unmount, never called under reduced motion. Use it for canvas particles and anything not
  expressible in CSS. Prefer CSS animation for everything else.
- `ctx.onCleanup(fn)` - run at unmount (clear timers, remove listeners added outside root).
- `ctx.timer(fn, ms)` / `ctx.every(fn, ms)` - setTimeout / setInterval that are cleared at unmount.

### Global attributes set by core on `<html>`

- `data-time="day|dusk|night"` - scenes restyle from this in CSS, with 2.5s-4s transitions so light changes slowly.
- `data-motion="reduced"` when the OS asks for reduced motion or the visitor turns on "Still mode".
  `base.css` then sets `animation: none !important; transition-duration: .01s !important` inside `.scene`.
  A scene must look complete and beautiful as a still picture.
- `data-scene="{id}"`, `data-entered="true"` after the intro.

### Hotspots

Any interactive element inside a scene:

```html
<g class="hotspot" tabindex="0" role="button" aria-label="Pour the tea" data-hint="Pour the tea">...</g>
```

- Core provides the shared look: pointer cursor, a soft warm glow on hover/focus, and a small hint label near the
  cursor that reads `data-hint`. It also turns Enter/Space on a focused hotspot into a click.
- `data-go="sceneId"` on a hotspot makes core call `Peace.go(sceneId)` on click. Use this for doors, windows and paths.
- The scene binds its own click handlers for actions. Hint text is lowercase-friendly, short, kind ("Pour the tea",
  "Wake the cat, gently", "Step into the greenhouse").
- Hotspots breathe very faintly every ~8s (core does it) so they can be discovered without labels on screen.

### `Peace.util`

```js
util.rand(min, max)            util.pick(array)            util.clamp(v, a, b)        util.lerp(a, b, t)
util.el(html)                  // HTML string -> first element
util.svg(markup)               // SVG markup string -> element, correct namespace
util.canvas(root, className)   // appends a full-size canvas, handles DPR + resize, returns {canvas, ctx2d, w(), h()}
util.sceneToScreen(svgEl, x, y) // viewBox point -> pixel point inside root
```

---

## 3. Art direction (binding for every visual file)

**Look:** semi-realistic animated film background painting. Cottagecore + Japanese slow living. Think hand-painted
gouache backgrounds with real light: soft atmospheric depth, warm bounce light, textured surfaces. Characters are
gently stylised (soft-shaded animated-film people, calm faces, small features) and sit naturally in the light of
the room. Never flat vector, never clip-art, never childish, never neon, never glassmorphism, never emoji.

**Scene canvas:** one inline `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">` filling root, plus
optional canvas overlays for particles. Keep the subject and all hotspots inside x 320-1280, y 140-740 so phone
portrait crops and the HUD (bottom 100px, top 70px) never hide them.

**How to get painterly depth out of SVG (use all of these, this is what separates wow from flat):**
- Build each scene back to front in 5-8 depth layers. Far layers are lighter, bluer/hazier, lower contrast and
  slightly blurred (`feGaussianBlur` 1-3). Foreground framing elements (leaves, a curtain edge, a chair back) are
  darker, larger, and blurred 3-6 to act as a lens.
- No flat fills on large shapes. Every surface gets a gradient (light side to shadow side) and a texture pass:
  `feTurbulence` + `feColorMatrix` clipped onto the shape or overlaid with `mix-blend-mode: multiply/soft-light`
  for wood grain, plaster, linen, grass, foliage clumps.
- Organic edges: run foliage, grass, clouds and fabric through `feTurbulence` + `feDisplacementMap` (scale 6-18) so
  nothing has a perfect vector edge. Draw foliage as many overlapping blobs in 3-4 tones, not as one shape.
- Light is a layer of its own: window light shafts and sun rays as soft gradient polygons with
  `mix-blend-mode: screen`, slowly breathing in opacity; warm pools of light on floors; contact shadows under
  every object (blurred dark ellipses); rim light on the character's sun side.
- Atmosphere: floating dust motes or pollen on a canvas in every lit scene; a faint haze gradient over the far layers.
- Core adds a global film grain and a soft vignette over every scene. Do not add your own.
- Three lighting states per scene driven by `html[data-time]`: day, dusk (amber/rose, long light), night
  (deep blue-green, lamps and windows glowing, moon). Implement with CSS custom properties, opacity cross-fades
  between sky gradients, and a colour-grade overlay rect with `mix-blend-mode: multiply`. Lamps, candles, fire and
  string lights get brighter at dusk and night.

**Palette** (muted, slightly desaturated, never pure white or pure black):
- cream `#f4ead8`, linen `#e9dcc3`, warm paper `#fbf5e9`, ink brown `#3b2f27`, soft ink `#6b5a4c`
- sage `#8fa58a`, moss `#5e7a56`, deep leaf `#34513a`, meadow `#a9bf8a`
- terracotta `#c98263`, dusty rose `#d9a5a0`, butter `#ecd28a`, honey light `#f6d9a0`
- sky day `#bcd9e6` to `#eef3e6`, dusk `#f2b89a` / `#d98f8f` / `#7c6f9c`, night `#1d2a44` / `#2f3f5c` / moon `#f3ecd2`
- wood light `#c9a57a`, wood mid `#9a7350`, wood dark `#5d4332`

**Type:** display `"Cormorant Garamond"` (italic for taglines), UI `"Zen Maru Gothic"`, handwriting `"Caveat"`.
Loaded by `index.html` from Google Fonts, with serif / system fallbacks.

**Motion:** slow, organic, never bouncy. Durations 4-14s for sway and breathing, `ease-in-out`, and give every
repeated element its own duration and negative `animation-delay` so nothing moves in sync. Animate only
`transform` and `opacity`. Sway pivots at the base (`transform-box: fill-box; transform-origin: 50% 100%`).
Rare events (page turn, cat stretch, a butterfly crossing, a petal falling) fire on random 12-40s timers so the
world feels alive rather than looped. Nothing may flash, shake, or pull the eye.

**Namespacing (inline SVG ids and CSS classes are global):** prefix every id, class, keyframe and CSS variable
with your scene prefix: garden `gd-`, tearoom `tr-`, livingroom `lr-`, bedroom `br-`, greenhouse `gh-`, sunset `ss-`.
Scope all scene CSS under `.scene-{id}`.

**Performance:** at most 2 canvases per scene, particles under 120, no filter animated per frame, blur filters only
on static groups, `will-change: transform` only on the handful of elements that move constantly. Target 60fps on a
laptop.

---

## 4. `Peace.audio` contract (agent AUDIO implements, everyone else may call)

All calls are safe before the visitor has enabled sound: they record intent and do nothing audible.
Sound never starts without a user gesture.

```js
audio.unlock()                 // call inside a user gesture; creates/resumes the AudioContext; returns a Promise
audio.enabled                  // true after unlock and while not muted
audio.musicTracks              // [{id:'piano', name:'Peaceful piano'}, {id:'guitar', name:'Soft acoustic guitar'},
                               //  {id:'instrumental', name:'Gentle instrumental'}]
audio.playMusic(id?)           // start or cross-fade to a track; no id = last track or 'piano'
audio.pauseMusic()             audio.toggleMusic()
audio.music                    // { id, playing }
audio.setMusicVolume(v)        audio.getMusicVolume()          // 0..1
audio.ambients                 // [{id:'rain', name:'Rainy afternoon'}, {id:'birds', name:'Morning birds'},
                               //  {id:'forest', name:'Forest'}, {id:'fire', name:'Fireplace'},
                               //  {id:'ocean', name:'Ocean waves'}, {id:'wind', name:'Gentle wind'},
                               //  {id:'night', name:'Night crickets'}]
audio.setSceneAmbience(map)    // core calls this on scene enter with def.ambience; cross-fades over ~3s
audio.setAmbient(id, v)        // visitor override, 0..1 (0 = off). Overrides win over the scene default
audio.getAmbient(id)           // effective level
audio.clearOverrides()         // back to the scene's own mix
audio.setMaster(v)             audio.getMaster()
audio.setMuted(bool)           audio.muted
audio.sfx(name)                // one-shots: 'pour', 'page', 'chime', 'cup', 'purr', 'switch', 'water', 'soft'
```

`Peace.emit('audio:change')` after any state change. Master, music volume, track, overrides and mute persist in
`sessionStorage` under the key `peace.audio`.

---

## 5. Work packages

### SHELL - `index.html`, `css/base.css`, `js/core.js`, `js/ui.js`

**core.js:** everything in section 2. Scene stage `#stage`; transitions; shared rAF loop; hotspot delegation and
hint label; time handling; reduced-motion handling; keyboard (left/right arrows = previous/next place, `M` map,
`H` hide interface, `Esc` closes panels). If a scene's `mount` throws, log it and show a quiet painted fallback
(soft gradient + the place name) rather than breaking the site.

**Scene transition** (about 2.2s, the single most cinematic moment, make it lovely): the current scene drifts
forward slightly and dissolves into warm light (opacity + a soft `blur` + scale 1.04), a title card fades up in the
centre - place name in Cormorant, tagline in italic beneath, a thin hand-drawn flourish - the new scene resolves
from the light (scale 1.04 to 1), then the card fades. Under reduced motion: a plain 400ms cross-fade.

**Opening (no navbar, no marketing block):** on load the garden scene is mounted and already alive, pushed in
slightly (scale ~1.08) and softened by a light warm veil. Over it, low and left of centre so it does not cover the
reading girl: "Slow down. You're home." (large Cormorant), "Leave the noise behind. Stay a little longer.", and
two quiet choices: a primary "Enter the garden" and beneath it a small text toggle "with sound / in silence"
(default: with sound, and the click on Enter is the gesture that unlocks audio and starts the piano plus the
garden ambience). Words arrive one line at a time, slowly. On enter: text fades, the veil lifts, the camera eases
back to scale 1 over ~3s, then the interface fades in.

**Interface after entering** (small, warm, out of the way; hand-inked line icons drawn as inline SVG, cream paper
tokens with ink-brown strokes, no glass, no drop-shadow-heavy cards):
- Bottom left: the sound token. Click opens the **Sound shelf**: play/pause, three music choices, a master volume,
  one slider per ambient (seven), "mute everything", and "back to this room's own sound". Sliders are styled as
  thin inked lines with a small round bead. Several ambients can play together.
- Bottom centre: the current place name; clicking it (or `M`) opens the **Map**: a hand-drawn illustrated map of
  the little world on a paper sheet - six small painted vignettes (drawn in SVG by you, one per place) joined by a
  dotted footpath, each labelled in Caveat; click one to walk there. Small arrows either side of the place name go
  to the previous / next place.
- Bottom right: Journal, Breathe, Let go, Time of day (day / dusk / night cycle, shows a tiny sun / low sun /
  moon), Still mode (reduced motion), and Hide interface.
- After ~8s without pointer movement the interface fades out by itself and returns on movement, so the visitor is
  left alone with the scene. The cursor hides too.
- Panels are paper sheets that slide up softly; one open at a time; focus-trapped; closable with Esc, an X, and a
  click outside. Use `<dialog>` or equivalent with correct ARIA.

**Healing features (ui.js):**
- **Little Journal:** a paper page with a dated header, a rotating gentle prompt the visitor can change ("How are
  you feeling today?", "What is on your mind?", "What are you grateful for?", "What do you want to let go of?",
  "What small thing was good today?", "What would you tell a friend who felt like this?"), a handwriting-font
  textarea on ruled lines, "Keep this page". Kept pages are listed below as small folded notes, can be reopened
  and deleted. Stored in `localStorage` (`peace.journal`). State clearly, once and quietly, that the words stay
  on this device only.
- **Breathe:** a soft circle of light that grows and shrinks over the scene (the scene stays visible, dimmed a
  little) with the words "breathe in", "hold", "breathe out" in Cormorant; 4-4-6 rhythm; a quiet chime
  (`audio.sfx('chime')`) at each change; ends itself after 6 rounds with "there you are."
- **Let go:** the visitor writes a worry in one line; it is written onto a small paper boat (or a leaf) which
  drifts slowly across the screen and fades into the light while the words dissolve. Nothing is stored.
- **A kind note:** after about 4 minutes in the world, a small folded note appears once near the bottom with a
  single gentle line ("You have been resting for a little while. That is allowed."). It leaves on its own.

**base.css:** tokens from section 3 as CSS variables, global film grain (SVG turbulence, very faint, static) and
vignette above the stage, hotspot look, focus rings that are visible but soft, the reduced-motion rule, full
phone support (interface collapses to three tokens + a "more" sheet under 640px), safe-area insets.
Z-order: stage 0, grain/vignette 5, interface 10, panels 20, transition card 30, opening 40.

### AUDIO - `js/audio.js`

Section 4, fully synthesized, and it must sound genuinely pleasant, not like test tones. One shared generated
convolution reverb (2.5-3.5s soft hall impulse), a gentle master low-pass and compressor, everything cross-fades
(never clicks: ramp every gain).
- **piano:** soft felt-piano voice (a few detuned partials, fast soft attack, long decay, low-passed, a touch of
  noise at the hammer) played by a generative player: slow tempo (~58 bpm, rubato), a warm progression in a major
  or lydian key (for example Fmaj7 - Cadd9 - Am7 - Bbmaj7 and variations), sparse left-hand broken chords, a
  right-hand melody that prefers steps, repeats small motifs, leaves real silences, and ends phrases on chord tones.
- **guitar:** Karplus-Strong plucked nylon strings rendered into AudioBuffers (no AudioWorklet), fingerpicked
  arpeggio patterns over a gentle progression, with small timing and velocity humanisation.
- **instrumental:** a warm slow pad (filtered saws/triangles with slow attack) under a music-box / celesta melody.
- **Ambients:** rain (filtered noise bed + individual drops + occasional soft distant thunder, very rare), birds
  (several distinct synthesized songs - chirps, trills, a two-note call - at random stereo positions and
  intervals), forest (leaf rustle, deeper birds, a far woodpecker or cuckoo now and then), fire (low brown-noise
  roar that wavers + random crackles and pops), ocean (slow 8-12s swells of filtered noise with foam hiss on the
  break), wind (band-passed noise with a wandering centre frequency and gusts), night (crickets pulse trains, a
  far owl rarely).
- **sfx:** short, soft, tasteful. 'pour' is water pouring into a cup for ~2.5s; 'page' a paper turn; 'chime' a
  small bell; 'cup' ceramic touch; 'purr' a cat purr for ~3s; 'switch' a lamp click; 'water' droplets; 'soft' a
  generic gentle tap.
- Suspend scheduling while the tab is hidden. Keep CPU low (no per-sample ScriptProcessor).

### GARDEN - the main attraction and the opening shot

Wide afternoon countryside garden. Back to front: soft sky with slow drifting clouds; hazy distant hills and
tree line; a small wooden cottage (shingle or thatch roof, a chimney with a thread of smoke, warm windows, a
climbing rose by the door) set back left of centre; mid-ground trees with dappled canopy; flower beds and borders
in muted colours; a small pond on the right with reeds, lily pads, a reflection of the sky and slow ripples; a
lawn with mown-light variation and dappled tree shadow that shifts slowly; in the right-centre foreground a wooden
lounge chair with a cushion and a blanket, and on it **the girl reading**; a side table with a glass of iced tea
and a straw hat; foreground out-of-focus flowers and leaves framing the corners.

**The girl** (the heart of the site, give her the most care): reclined, knees slightly up, book held open above
her lap, soft summer dress or linen shirt and trousers, hair loose or in a loose braid, a calm small smile, eyes
lowered to the page. Soft gradient shading with a warm rim light from the sun side; no black outlines. Animate:
chest/shoulders breathing (very small scale/translate, 5s), blink every 4-9s, eyes moving along the lines, a page
turn every 20-40s (the page arcs over, with `audio.sfx('page')`), hair strands and the dress hem and the blanket
edge moving in the wind on separate timings, a foot that occasionally sways, once in a long while she looks up at
a passing butterfly and back down.

Also: leaves and branches swaying, flowers nodding on individual timings, 2-4 butterflies on natural wandering
paths with fluttering wings (one sometimes lands on a flower), clouds drifting, sun rays through the canopy,
pollen motes, pond ripples and an occasional fish ring, a bird crossing the far sky rarely, chimney smoke.
Dusk: long amber light, windows glow. Night: moonlit blue, fireflies over the lawn and pond, cottage windows warm,
the girl reads by a small lantern on the side table.
Hotspots: cottage door -> `livingroom` ("Go inside, by the fire"); a glint of glass behind the trees ->
`greenhouse`; a garden path leading off right -> `sunset` ("Walk to the sunset corner"); the cottage window with
a teapot on the sill -> `tearoom`; the pond ("Touch the water": ripples + `sfx('water')`); a flower bed (a small
burst of petals drifts up); the girl ("She smiles and turns a page").
`preferredTime:'day'`, `ambience:{birds:.45, wind:.2}`.

### ROOMS - tea room and living room

**Tea room** (`tearoom`, "warm cups, slow afternoons", day, `{birds:.2, wind:.1}`): a countryside tea room seen
from a seat at a wooden table. A large mullioned window fills the upper middle, looking out on the garden
(painted soft and bright: lawn, trees, a hint of the pond); linen curtains either side moving in a light draught;
sunlight falling across the table in warm bars with dust motes in it; on the table a ceramic teapot, two cups on
saucers, a small plate of biscuits, a vase of garden flowers, an open book with reading glasses; shelves with
ceramics and tins, a hanging plant, a wall clock whose hands show the real time. Interactions: click the teapot ->
it lifts, tilts, a stream of tea pours and the cup fills (`sfx('pour')`), then steam rises from the cup in soft
curling wisps for a long while; click a filled cup -> a sip (level drops a little, `sfx('cup')`) and toggles a
soft ambient (rain on first cup, wind on the second, via `audio.setAmbient`); click the vase -> a petal falls;
click the book -> a page turns; click the window -> `garden` ("Step out to the garden"); a doorway on the side
-> `livingroom`.

**Living room** (`livingroom`, "firelight and rain on the glass", preferred `night`, `{fire:.55, rain:.4}`): a
stone or brick fireplace with a living fire (layered flame shapes animating organically plus canvas embers;
flickering warm light on the whole room via a breathing radial overlay, never strobing), a deep sofa with a knitted
blanket and cushions, bookshelves, a floor lamp, a rug, a low wooden table with a mug, a window with rain running
down the glass (canvas streaks; switch to slow snow when the visitor clicks the window: "Let it snow" / "Let it
rain"), curtains stirring, **a cat asleep** on the rug or sofa arm: breathing visibly, ear twitch, tail tip
flick, and every 30-60s a slow stretch and resettle. Click the cat -> it lifts its head, blinks slowly, purrs
(`sfx('purr')`). Click the lamp -> on/off (`sfx('switch')`), room light changes. Click the fire -> a log shifts,
sparks rise. Stairs or a door -> `bedroom` ("Go up to bed"); another door -> `tearoom`; front door -> `garden`.

### REST - bedroom and greenhouse

**Bedroom** (`bedroom`, "soft blankets, quiet night", preferred `night`, `{night:.35, wind:.1}`): a low wooden bed
with layered blankets and pillows under a large window; bedside table with a warm lamp, a stack of books, a cup;
a plant, a rug, a chair with a cardigan; sheer curtains breathing with the air. Night: moon and slow stars through
the window, moonlight in a pale parallelogram across the bed, the lamp making a honey pool. Day: morning sun, a
tree outside, motes in the light. A small animated person asleep under the blanket (only hair and a shoulder,
breathing slowly) at night; by day the bed is made and a sleeping-in cat or an open book lies on it.
Interactions: a sun/moon ornament or the window -> toggles day and night through `Peace.setTime` (the light must
travel beautifully between states over ~4s); the lamp -> on/off; a small bedside radio or music box -> starts
gentle music (`audio.playMusic('instrumental')`); the window latch -> toggles rain (`audio.setAmbient('rain',…)`
plus rain on the glass); the door -> `livingroom`.

**Greenhouse** (`greenhouse`, "glass, green, growing things", day, `{birds:.3, forest:.25}`): inside a Victorian-
style glass house: white-painted iron ribs and a glass roof with sky and tree shadows beyond, light pouring through
in shafts with glass reflections, wooden staging shelves with terracotta pots, ferns, trailing plants, orchids,
seedlings, a hanging basket, a watering can, a trowel, gloves, a stool, a brick floor with moss. Condensation
droplets that slowly gather and run down a few panes. Plants sway on separate timings. Several buds that open
slowly while you watch (a bloom takes ~20s, staggered, and re-bud much later). Click the watering can -> it
tilts and waters a pot (`sfx('water')`), the plant perks up and a flower opens; click a bud -> it blooms; click a
pane -> a droplet runs; the door at the end -> `garden`; a side door -> `sunset`. Sunlight angle and warmth
follow `data-time`; at night the glass shows the moon and a single hanging lantern glows.

### DUSK - sunset corner

(`sunset`, "the day, letting go", preferred `dusk`, `{wind:.3, night:.15}`): an outdoor terrace at the edge of the
garden looking west over fields to low hills. Wooden bench or two chairs with cushions and a blanket, a small
table with a teapot and two cups (steam rising), a string of hanging bulbs between two posts or tree branches,
potted flowers, tall grasses and trees framing the view, a distant farmhouse with one lit window. A person and a
dog (or two friends) seen from behind sitting quietly watching the sky, breathing, hair moving. The sky is the
star: a rich layered gradient with lit cloud undersides that slowly changes colour by itself (a ~3 minute drift
within the dusk palette), the sun sinking a few pixels over time; birds crossing in a small V rarely. Night: deep
blue with stars appearing one by one, a moon, the string lights glowing warmly with soft halos, **fireflies**
(canvas, soft green-gold, drifting and pulsing, 30-50 of them) over the grasses. Day: bright calm afternoon.
Grasses and flowers move in the wind. Interactions: the string lights -> on/off with a gentle glow ripple; the
teapot -> pour; the sky -> advances the time of day (`Peace.setTime` to the next state); a firefly jar or the
grasses -> releases a small swirl of fireflies at night; the path -> `garden`; a gate -> `greenhouse`.

---

## 6. Definition of done (each agent checks its own part)

- Looks like a frame of a painted animated film, in all three times of day, at 1440x900 and at 390x844.
- Alive within two seconds of looking, and never busy.
- Every required element and interaction of your package exists and works with mouse and keyboard.
- No console errors. `node --check` passes. No ids or classes without your prefix.
- Reduced motion gives a complete, still picture.
- Final report to the lead: 5 lines at most - what was built, anything not finished, anything that needs another
  agent's file to change.
