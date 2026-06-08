# Art brief — "Hero" Girl avatar (rig-ready)

Goal: a **detailed, illustrated** version of the girl character that drops into
the Dance Now! puppet rig with **no code changes**. The art quality should match
a polished cartoon (clean cel-shaded illustration), but it MUST be delivered as
**separated, pivot-defined body parts in a neutral A-pose**.

Hand this whole document to an illustrator, or to Lovable.

---

## 1. Character design (keep this look)
A cheerful young girl, hip-hop dancer style:
- Light-brown skin, **long brown hair** (past the shoulders, soft strands, with a
  fringe/bangs), big friendly **cartoon eyes** with lashes, happy open smile,
  rosy cheeks.
- **Teal backwards snapback cap** (flat brim, snap strap + button).
- **Gold hoop earrings** and a **gold chain** necklace.
- **Teal hoodie**: hood V-neck, white drawstrings, kangaroo front pocket, ribbed
  cuffs and waistband, subtle cel-shading.
- **Teal joggers** with ribbed ankle cuffs.
- **White-and-teal high-top sneakers** (laces, sole, ankle collar).
- Bright, friendly, kid-appropriate. Thick clean outlines, flat colours + simple
  cel shading (one shadow tone per colour). No photo-realism.

(Reference: the existing simplified `girl.svg` / `girl-render.png` for the
identity and palette — but far more detailed and illustrated.)

## 2. Pose — NEUTRAL A-POSE (critical)
Draw her **front-facing, standing still** in an A-pose — NOT a dynamic dance
pose:
- Arms **down and slightly out** from the body (a gentle "A").
- Legs **straight, slightly apart**, weight even on both feet.
- Looking straight ahead, smiling.

This is the rest pose the rig bends from. A dynamic pose cannot be rigged.

## 3. Build it from SEPARATED PARTS (critical)
Cut the character into these **10 parts**, each a complete shape on its own:

```
part-head            part-torso
part-upperarm-left   part-forearm-left   (draw the HAND inside the forearm)
part-upperarm-right  part-forearm-right
part-thigh-left      part-shin-left      (draw the SHOE inside the shin)
part-thigh-right     part-shin-right
```

- **Draw the body complete behind every limb** — no holes where a limb overlaps,
  because limbs move independently.
- Give limbs **rounded ends that overlap slightly at the joints**, so no gaps
  appear when a limb rotates.
- "left"/"right" = the **viewer's** left/right (image-left parts are the `-left`
  ones).
- Layer order, back to front: **torso, thighs, shins, upper arms, forearms,
  head**. (Hair/cap are part of `part-head`.)

## 4. Canvas + joint anchors (critical)
- Canvas / SVG `viewBox` = **`0 0 400 700`**, **transparent background**.
- Place each joint pivot at these **exact coordinates** and pose the limbs along
  them (proximal → distal):

| Anchor id | x | y |
|---|---|---|
| anchor-neck | 200 | 165 |
| anchor-shoulder-left | 155 | 190 |
| anchor-shoulder-right | 245 | 190 |
| anchor-elbow-left | 117 | 293 |
| anchor-elbow-right | 283 | 293 |
| anchor-wrist-left | 83 | 387 |
| anchor-wrist-right | 317 | 387 |
| anchor-hip-center | 200 | 372 |
| anchor-hip-left | 175 | 375 |
| anchor-hip-right | 225 | 375 |
| anchor-knee-left | 165 | 515 |
| anchor-knee-right | 235 | 515 |
| anchor-ankle-left | 160 | 648 |
| anchor-ankle-right | 240 | 648 |

(Head centre sits around y≈108; feet/soles around y≈670.)

## 5. Deliver in ONE of these formats

### Preferred — layered SVG
A single SVG, `viewBox="0 0 400 700"`, transparent, with:
- each part in a `<g id="part-...">` group (exact ids above), nothing merged;
- a zero-opacity marker at every joint:
  `<circle id="anchor-..." cx="X" cy="Y" r="3" fill="none" opacity="0"/>`;
- **no `clipPath`, `mask`, or `filter`** (cel-shade with plain filled shapes);
- flat fills (+ optional simple shadow shapes).

### Alternative — PNG parts + manifest
Each part as its own **transparent PNG** on the 400×700 canvas, plus a
`name.json` manifest. Full format and example: see **`SLICING.md`**.

## 6. Acceptance checklist
- [ ] Neutral **A-pose**, front-facing.
- [ ] Exactly **10 `part-*`** pieces, none merged; body drawn complete behind limbs.
- [ ] **14 `anchor-*`** markers at the coordinates above (SVG) or in the manifest.
- [ ] `viewBox 0 0 400 700`, transparent background.
- [ ] No `clipPath` / `mask` / `filter`.
- [ ] Limb ends rounded + overlapping at joints (no gaps when rotated).
- [ ] Looks like the girl in section 1, just illustrated in detail.

Deliver the **raw SVG** (or the PNGs + `name.json`). Drop it in the repo and it
loads via `loadAvatar("name")` — no rig code changes.
