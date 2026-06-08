# Adding a detailed avatar from sliced PNG parts

The rig (`avatars.js`) can load a character two ways:

1. **SVG** — `name.svg` with `part-*` groups + `anchor-*` markers (see `girl.svg`).
2. **PNG parts** — `name.json` manifest pointing at one transparent PNG per body
   part. Use this to keep a fully-detailed/illustrated look.

`loadAvatar("name")` tries `name.json` first, then falls back to `name.svg`.

## What to produce

Draw the character **once, front-facing, in a neutral A-pose** (arms slightly
out and down, legs slightly apart), then separate it into **10 body parts**, each
exported as its **own transparent PNG**:

```
part-head        part-torso
part-upperarm-left   part-forearm-left   (hand inside the forearm)
part-upperarm-right  part-forearm-right
part-thigh-left      part-shin-left      (shoe inside the shin)
part-thigh-right     part-shin-right
```

Rules so the rig looks clean:
- **Draw the body complete behind every limb** — no holes where a limb used to
  overlap, because limbs move.
- Give each limb **rounded ends that overlap slightly at the joints** so no gaps
  show when it rotates.
- Work on a **400 × 700** canvas (the rig's viewBox). Export each part **trimmed**
  and record its top-left position on that canvas.

## The manifest (`name.json`)

Coordinates are in the 400 × 700 viewBox. Anchors are the **joint pivot points**
(where each bone bends). `parts[id]` gives the trimmed PNG and where it sits.

```json
{
  "viewBox": [400, 700],
  "anchors": {
    "anchor-neck": [200, 165],
    "anchor-shoulder-left": [155, 190],
    "anchor-shoulder-right": [245, 190],
    "anchor-elbow-left": [117, 293],
    "anchor-elbow-right": [283, 293],
    "anchor-wrist-left": [83, 387],
    "anchor-wrist-right": [317, 387],
    "anchor-hip-center": [200, 372],
    "anchor-hip-left": [175, 375],
    "anchor-hip-right": [225, 375],
    "anchor-knee-left": [165, 515],
    "anchor-knee-right": [235, 515],
    "anchor-ankle-left": [160, 648],
    "anchor-ankle-right": [240, 648]
  },
  "parts": {
    "part-torso":         { "src": "girlhd/torso.png",     "x": 120, "y": 150, "w": 160, "h": 235 },
    "part-thigh-left":    { "src": "girlhd/thigh-l.png",   "x": 140, "y": 360, "w": 60,  "h": 165 },
    "part-thigh-right":   { "src": "girlhd/thigh-r.png",   "x": 200, "y": 360, "w": 60,  "h": 165 },
    "part-shin-left":     { "src": "girlhd/shin-l.png",    "x": 120, "y": 500, "w": 80,  "h": 190 },
    "part-shin-right":    { "src": "girlhd/shin-r.png",    "x": 200, "y": 500, "w": 80,  "h": 190 },
    "part-upperarm-left": { "src": "girlhd/uparm-l.png",   "x": 90,  "y": 175, "w": 90,  "h": 135 },
    "part-upperarm-right":{ "src": "girlhd/uparm-r.png",   "x": 230, "y": 175, "w": 90,  "h": 135 },
    "part-forearm-left":  { "src": "girlhd/forearm-l.png", "x": 55,  "y": 280, "w": 80,  "h": 145 },
    "part-forearm-right": { "src": "girlhd/forearm-r.png", "x": 265, "y": 280, "w": 80,  "h": 145 },
    "part-head":          { "src": "girlhd/head.png",      "x": 120, "y": 30,  "w": 160, "h": 170 }
  }
}
```

- `x`,`y` = top-left of that PNG on the 400 × 700 canvas.
- `w`,`h` = the PNG's size in viewBox units (export at 1× the canvas, or 2× and
  still give the viewBox `w`/`h` here — the rig scales it).
- The `anchors` above are the rig's defaults; keep them unless your art's joints
  sit elsewhere, then update to match where each joint actually is in your art.

## Wiring it up

1. Drop `name.json` + the part PNGs into the repo root (e.g. `girlhd.json` and a
   `girlhd/` folder).
2. Add the part files to the `ASSETS` list in `sw.js` (for offline) and bump the
   `CACHE` version.
3. Add `["name", "Label"]` to the `CHARACTERS` array in `camera-game.js` so it
   appears in the picker.

That's it — no rig code changes.
