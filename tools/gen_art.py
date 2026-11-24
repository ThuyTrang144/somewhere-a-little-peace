#!/usr/bin/env python3
"""Generate the scene paintings with the local museai gateway.

One image at a time, skips files that already exist, so it is safe to rerun.
    python3 tools/gen_art.py            # everything missing
    python3 tools/gen_art.py garden     # one scene
Key file: $MUSE_KEY_FILE (default ~/dev/museai/data/api_key). Never printed.
"""
import base64, json, os, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "art")
RAW = os.path.join(ROOT, "assets", "art", "_raw")
API = os.environ.get("MUSE_API", "http://127.0.0.1:18610")
KEY_FILE = os.path.expanduser(os.environ.get("MUSE_KEY_FILE", "~/dev/museai-work/data/api_key"))

STYLE = (
    "Background painting from a hand-painted animated feature film, semi-realistic: "
    "richly detailed gouache and watercolour environment with real natural light, soft atmospheric depth, "
    "believable textures of wood, linen, plaster, leaves and grass, gentle film grain. "
    "Cottagecore English countryside mixed with Japanese slow living. Muted, slightly desaturated, warm palette "
    "of cream, sage green, moss, terracotta, dusty rose and honey light. Nostalgic, quiet, emotionally comforting. "
    "Wide cinematic 16:9 composition, eye-level camera, the lower fifth of the frame calm and uncluttered. "
    "NO text, NO letters, NO logos, NO watermark, NO border. Not photographic, not 3D render, not flat vector, "
    "not childish cartoon, not neon, no exaggerated anime faces."
)

LIGHT = {
    "day": "Time: bright calm afternoon, soft warm sunlight, pale blue sky, gentle dappled shadows.",
    "dusk": "Time: golden hour just before sunset, long amber and rose light, peach and lavender sky, "
            "lamps and windows beginning to glow warmly.",
    "night": "Time: quiet night, deep blue-green moonlight, a soft moon and stars where sky is visible, "
             "lamps, candles, lanterns and windows glowing warm honey gold, cosy not dark or scary.",
}

RELIGHT = (
    "NEW STANDALONE REQUEST. Use the attached image as the exact scene: keep the identical composition, camera, "
    "layout, architecture, furniture, every object and every character in exactly the same place, pose and "
    "proportions, same painting style. Change ONLY the time of day and the lighting. "
)

SCENES = {
    "garden": {
        "base": "day",
        "prompt": "A beautiful countryside cottage garden. Left of centre and set back: a small wooden cottage with a "
                  "shingle roof, a chimney, small-paned windows, a climbing rose around a wooden door. Lush trees with "
                  "dappled canopy, flower borders in muted colours, a mown lawn. On the right side a small still pond with "
                  "reeds and lily pads reflecting the sky. In the right-centre mid-ground, a young woman rendered as a "
                  "gently stylised animated-film character reclines on a wooden lounge chair with a cushion and a "
                  "blanket, reading an open book, calm small smile, eyes lowered to the page, loose braid, simple linen "
                  "summer dress; a small side table with a glass of iced tea, a straw hat and a small lantern beside her. "
                  "A glass greenhouse glints far behind the trees; a stepping-stone path leads off to the right. "
                  "Out-of-focus flowers and leaves frame the foreground corners. The left third of the lawn is open "
                  "and calm.",
    },
    "tearoom": {
        "base": "day",
        "prompt": "Interior of a cosy countryside tea room, seen from a seat at a wooden table. A large mullioned window "
                  "fills the upper middle of the frame and looks out on a soft bright garden with lawn and trees. Linen "
                  "curtains at both sides of the window. On the wooden table in the foreground: a round ceramic teapot, "
                  "two empty ceramic cups on saucers, a small plate of biscuits, a glass vase of garden flowers, an open "
                  "book with reading glasses. Wooden shelves with ceramics and tea tins on the left wall, a hanging plant, "
                  "a plain round wall clock, a wooden doorway on the right wall. Bars of light fall across the table. "
                  "No people.",
    },
    "livingroom": {
        "base": "night",
        "prompt": "Interior of a warm nostalgic cottage living room. A stone fireplace on the left-centre with a gentle log "
                  "fire burning, a deep comfortable sofa with a knitted blanket and cushions, tall bookshelves full of "
                  "books, a floor lamp with a fabric shade glowing, a patterned wool rug, a low wooden table with a mug. "
                  "A cat curled up asleep on the rug in front of the fire. On the right wall a large window with rain "
                  "running down the glass and soft curtains. A wooden staircase and a door at the right edge. "
                  "Firelight fills the room. No people.",
    },
    "bedroom": {
        "base": "night",
        "prompt": "Interior of a peaceful cottage bedroom. A low wooden bed with layered soft blankets and plump pillows "
                  "under a large small-paned window with sheer curtains; through the window a tree and the sky. A bedside "
                  "table with a warm glowing lamp, a stack of books, a cup and a small vintage radio. A potted plant, a "
                  "woven rug, a wooden chair with a cardigan over its back, a wooden door on the left wall. A pale shape "
                  "of light from the window lies across the bed. The bed is made and empty. No people.",
    },
    "greenhouse": {
        "base": "day",
        "prompt": "Inside a beautiful Victorian-style glass greenhouse. White-painted iron ribs and a glass roof with sky "
                  "and tree shadows beyond, light pouring through in soft shafts. Wooden staging shelves on both sides "
                  "crowded with terracotta pots, ferns, trailing plants, orchids, seedlings and flower buds; a hanging "
                  "basket; a metal watering can, a trowel and gardening gloves on a bench; a small wooden stool; an old "
                  "brick floor with moss between the bricks; condensation on some panes. A glass door at the far end "
                  "opens to a garden. Central brick aisle leading to the door. No people.",
    },
    "sunset": {
        "base": "dusk",
        "prompt": "An outdoor wooden terrace at the edge of a cottage garden, looking west over fields to low hills. In the "
                  "centre, seen from behind, a young woman in a cardigan with a blanket over her shoulders sits on a "
                  "wooden bench beside a calm dog, both quietly watching the sky. A small table with a teapot and two "
                  "cups. A string of hanging bulbs between two wooden posts across the top of the frame, potted flowers, "
                  "tall grasses and trees framing both sides, a distant farmhouse with one lit window, a wooden gate at "
                  "the left edge and a path at the right. The sky fills the upper half: rich layered clouds with lit "
                  "undersides.",
    },
}


def call(prompt, ref=None):
    body = {"prompt": prompt, "n": 1, "size": "16:9", "response_format": "b64_json"}
    if ref:
        with open(ref, "rb") as f:
            body["image"] = "data:image/png;base64," + base64.b64encode(f.read()).decode()
    key = open(KEY_FILE).read().strip()
    req = urllib.request.Request(
        API + "/v1/images/generations", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        data = json.load(r)
    return base64.b64decode(data["data"][0]["b64_json"])


def make(scene, time_, prompt, ref=None):
    raw = os.path.join(RAW, f"{scene}-{time_}.png")
    out = os.path.join(OUT, f"{scene}-{time_}.jpg")
    if not os.path.exists(raw):
        for attempt in range(1, 5):
            try:
                img = call(prompt, ref)
                with open(raw, "wb") as f:
                    f.write(img)
                break
            except Exception as e:  # noqa: BLE001
                print(f"  {scene}-{time_} attempt {attempt} failed: {type(e).__name__} {str(e)[:120]}", flush=True)
                time.sleep(45)
        else:
            print(f"FAILED {scene}-{time_}", flush=True)
            return None
    if not os.path.exists(out):
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "86", "-Z", "2400", raw, "--out", out],
                       check=True, capture_output=True)
    print(f"ok {scene}-{time_}", flush=True)
    return raw


def main():
    os.makedirs(RAW, exist_ok=True)
    only = sys.argv[1:]
    todo = [s for s in SCENES if not only or s in only]
    bases = {}
    for s in todo:  # bases first, so every place has a painting early
        d = SCENES[s]
        bases[s] = make(s, d["base"], f"{d['prompt']} {LIGHT[d['base']]} {STYLE}")
    for s in todo:
        d = SCENES[s]
        if not bases.get(s):
            continue
        for t in ("day", "dusk", "night"):
            if t != d["base"]:
                make(s, t, f"{RELIGHT}{LIGHT[t]} Scene for reference: {d['prompt']} {STYLE}", ref=bases[s])
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
