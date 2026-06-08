/* ============================================================
   avatars.js — 2D puppet rig.

   Loads a character SVG built to the rig spec (groups id="part-*",
   zero-opacity markers id="anchor-*"), splits each part into its own
   image, and draws the character onto a canvas by mapping every part's
   rest "bone" (two anchors) onto the live tracked joints.

   Data-driven: any SVG following the spec works — swap the .svg files to
   reskin. Falls back gracefully (caller draws the stick figure) until a
   character's images have loaded.
   ============================================================ */

// Draw order: back to front.
const DRAW_ORDER = [
  "part-torso",
  "part-thigh-left", "part-thigh-right",
  "part-shin-left", "part-shin-right",
  "part-upperarm-left", "part-upperarm-right",
  "part-forearm-left", "part-forearm-right",
  "part-head",
];

// For each part: the two anchor ids defining its rest "bone" (proximal→distal).
// "__head_top__" is synthesised just above the neck (no anchor for it).
const REST_BONES = {
  "part-torso":         ["anchor-neck", "anchor-hip-center"],
  "part-head":          ["anchor-neck", "__head_top__"],
  "part-upperarm-left": ["anchor-shoulder-left", "anchor-elbow-left"],
  "part-forearm-left":  ["anchor-elbow-left", "anchor-wrist-left"],
  "part-upperarm-right":["anchor-shoulder-right", "anchor-elbow-right"],
  "part-forearm-right": ["anchor-elbow-right", "anchor-wrist-right"],
  "part-thigh-left":    ["anchor-hip-left", "anchor-knee-left"],
  "part-shin-left":     ["anchor-knee-left", "anchor-ankle-left"],
  "part-thigh-right":   ["anchor-hip-right", "anchor-knee-right"],
  "part-shin-right":    ["anchor-knee-right", "anchor-ankle-right"],
};

// For each part: the two tracked joints (from a {sL,sR,eL,...,head} set) the
// rest bone maps onto. mid() = average of two joints.
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const TARGETS = {
  "part-torso":         (j) => [mid(j.sL, j.sR), mid(j.hL, j.hR)],
  "part-head":          (j) => [mid(j.sL, j.sR), j.head],
  "part-upperarm-left": (j) => [j.sL, j.eL],
  "part-forearm-left":  (j) => [j.eL, j.wL],
  "part-upperarm-right":(j) => [j.sR, j.eR],
  "part-forearm-right": (j) => [j.eR, j.wR],
  "part-thigh-left":    (j) => [j.hL, j.kL],
  "part-shin-left":     (j) => [j.kL, j.aL],
  "part-thigh-right":   (j) => [j.hR, j.kR],
  "part-shin-right":    (j) => [j.kR, j.aR],
};

const VIEW_W = 400, VIEW_H = 700;

class Character {
  constructor() { this.parts = {}; this.ready = false; this.failed = false; }

  // Load by name: prefer a PNG-parts manifest (name.json), else an SVG (name.svg).
  async loadAny(name, base) {
    const jsonUrl = new URL(`${name}.json`, base).href;
    try {
      const res = await fetch(jsonUrl);
      if (res.ok) { await this.loadManifest(await res.json(), jsonUrl); return; }
    } catch (e) { /* no manifest — fall through to SVG */ }
    await this.loadSvg(new URL(`${name}.svg`, base).href);
  }

  // Build rest bones (proximal/distal anchors) for every part from an anchor map.
  _restBones(anchors) {
    if (anchors["anchor-neck"]) {
      anchors["__head_top__"] = { x: anchors["anchor-neck"].x, y: anchors["anchor-neck"].y - 57 };
    }
    const rest = {};
    for (const id of DRAW_ORDER) {
      const [a, b] = REST_BONES[id];
      if (anchors[a] && anchors[b]) rest[id] = [anchors[a], anchors[b]];
    }
    return rest;
  }

  async loadSvg(url) {
    try {
      const text = await (await fetch(url)).text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      if (doc.querySelector("parsererror")) throw new Error("SVG parse error");

      const anchors = {};
      doc.querySelectorAll('[id^="anchor-"]').forEach((el) => {
        anchors[el.id] = { x: parseFloat(el.getAttribute("cx")), y: parseFloat(el.getAttribute("cy")) };
      });
      const rest = this._restBones(anchors);

      const serializer = new XMLSerializer();
      const loads = [];
      for (const id of DRAW_ORDER) {
        const g = doc.getElementById(id);
        if (!g || !rest[id]) continue;
        // standalone SVG containing just this part (drawn at its rest position)
        const svg =
          `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${VIEW_W} ${VIEW_H}">` +
          serializer.serializeToString(g) + `</svg>`;
        const img = new Image();
        const p = new Promise((res) => { img.onload = res; img.onerror = res; });
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        loads.push(p);
        this.parts[id] = { img, rest: rest[id], x: 0, y: 0, w: VIEW_W, h: VIEW_H };
      }
      await Promise.all(loads);
      this.ready = Object.keys(this.parts).length > 0;
    } catch (e) {
      console.warn("Avatar SVG load failed for", url, e);
      this.failed = true;
    }
  }

  // PNG-parts manifest: { anchors:{id:[x,y]}, parts:{ part-id:{src,x,y,w,h} } }
  // Each part PNG is the trimmed art placed at (x,y) in the 400x700 viewBox.
  async loadManifest(man, baseUrl) {
    try {
      const anchors = {};
      for (const k in (man.anchors || {})) anchors[k] = { x: man.anchors[k][0], y: man.anchors[k][1] };
      const rest = this._restBones(anchors);
      const loads = [];
      for (const id of DRAW_ORDER) {
        const pd = man.parts && man.parts[id];
        if (!pd || !rest[id]) continue;
        const img = new Image();
        const p = new Promise((res) => { img.onload = res; img.onerror = res; });
        img.src = new URL(pd.src, baseUrl).href;
        loads.push(p);
        this.parts[id] = { img, rest: rest[id], x: pd.x || 0, y: pd.y || 0, w: pd.w || 0, h: pd.h || 0 };
      }
      await Promise.all(loads);
      for (const id in this.parts) {
        const pt = this.parts[id];
        if (!pt.w) pt.w = pt.img.naturalWidth;
        if (!pt.h) pt.h = pt.img.naturalHeight;
      }
      this.ready = Object.keys(this.parts).length > 0;
    } catch (e) {
      console.warn("Avatar manifest load failed", e);
      this.failed = true;
    }
  }

  // Draw onto ctx given normalized joints (0..1) for the canvas of size W×H.
  draw(ctx, joints, W, H) {
    if (!this.ready || !joints) return false;
    for (const id of DRAW_ORDER) {
      const part = this.parts[id];
      const target = TARGETS[id];
      if (!part || !target) continue;
      const [t0n, t1n] = target(joints);
      if (!t0n || !t1n) continue;
      const T0 = { x: t0n.x * W, y: t0n.y * H }, T1 = { x: t1n.x * W, y: t1n.y * H };
      const [R0, R1] = part.rest;

      const dR = { x: R1.x - R0.x, y: R1.y - R0.y };
      const dT = { x: T1.x - T0.x, y: T1.y - T0.y };
      const lenR = Math.hypot(dR.x, dR.y) || 1;
      const lenT = Math.hypot(dT.x, dT.y);
      const s = lenT / lenR;
      const ang = Math.atan2(dT.y, dT.x) - Math.atan2(dR.y, dR.x);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // map rest bone -> target bone:  T0 + Rot(ang)*s*(P - R0)
      ctx.translate(T0.x, T0.y);
      ctx.rotate(ang);
      ctx.scale(s, s);
      ctx.translate(-R0.x, -R0.y);
      ctx.drawImage(part.img, part.x, part.y, part.w, part.h);
      ctx.restore();
    }
    return true;
  }
}

const cache = {};
export function loadAvatar(name) {
  if (cache[name]) return cache[name];
  const c = new Character();
  c.loadAny(name, import.meta.url);   // tries name.json (PNG parts) then name.svg
  cache[name] = c;
  return c;
}
