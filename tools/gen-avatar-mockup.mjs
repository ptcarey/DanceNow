// Static MOCKUP of the code-drawn, riggable 2D avatar (taller/dynamic kid).
// Dependency-free (Node zlib). Draws layered body parts from a "joints" pose —
// the same idea the in-game puppet rig will use. node tools/gen-avatar-mockup.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 720, H = 960, SS = 3;

/* ---------- buffer + compositing ---------- */
const buf = new Float64Array(W * H * 3);
function bg(c) { for (let i = 0; i < W * H; i++) { buf[i*3]=c[0]; buf[i*3+1]=c[1]; buf[i*3+2]=c[2]; } }
function blend(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  buf[i]   = buf[i]   * (1 - a) + c[0] * a;
  buf[i+1] = buf[i+1] * (1 - a) + c[1] * a;
  buf[i+2] = buf[i+2] * (1 - a) + c[2] * a;
}
// paint a shape (inside test) with supersampled coverage over a bbox
function paint(x0, y0, x1, y1, inside, color, alpha = 1) {
  x0 = Math.max(0, x0|0); y0 = Math.max(0, y0|0);
  x1 = Math.min(W, x1|0); y1 = Math.min(H, y1|0);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let cov = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++)
      if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) cov++;
    cov /= SS * SS;
    if (cov > 0) blend(x, y, color, cov * alpha);
  }
}

/* ---------- geometry ---------- */
function distSeg(px, py, a, b) {
  const vx = b[0]-a[0], vy = b[1]-a[1], wx = px-a[0], wy = py-a[1];
  const c1 = vx*wx + vy*wy; if (c1 <= 0) return Math.hypot(px-a[0], py-a[1]);
  const c2 = vx*vx + vy*vy; if (c2 <= c1) return Math.hypot(px-b[0], py-b[1]);
  const t = c1/c2; return Math.hypot(px-(a[0]+t*vx), py-(a[1]+t*vy));
}
const bboxSeg = (a, b, r) => [Math.min(a[0],b[0])-r, Math.min(a[1],b[1])-r, Math.max(a[0],b[0])+r, Math.max(a[1],b[1])+r];

const OUTLINE = [43, 34, 51];
const OW = 7;
function capsule(a, b, r, color) {
  paint(...bboxSeg(a, b, r + OW), (x, y) => distSeg(x, y, a, b) <= r + OW, OUTLINE);
  paint(...bboxSeg(a, b, r), (x, y) => distSeg(x, y, a, b) <= r, color);
}
function disc(c, r, color, outline = true) {
  if (outline) paint(c[0]-r-OW, c[1]-r-OW, c[0]+r+OW, c[1]+r+OW, (x, y) => Math.hypot(x-c[0], y-c[1]) <= r + OW, OUTLINE);
  paint(c[0]-r, c[1]-r, c[0]+r, c[1]+r, (x, y) => Math.hypot(x-c[0], y-c[1]) <= r, color);
}
function ellipse(c, rx, ry, color, alpha = 1) {
  paint(c[0]-rx, c[1]-ry, c[0]+rx, c[1]+ry, (x, y) => ((x-c[0])**2)/(rx*rx) + ((y-c[1])**2)/(ry*ry) <= 1, color, alpha);
}

/* ---------- palette ---------- */
const SKIN = [242, 181, 140], HAIR = [59, 42, 29], SHIRT = [43, 182, 115],
      SHORTS = [58, 102, 200], SHOE = [240, 244, 255], CHEEK = [255, 150, 150];

/* ---------- pose (taller/dynamic kid, friendly "yay" pose) ---------- */
const J = {
  head: [360, 150], neck: [360, 205],
  sL: [285, 222], sR: [435, 222],
  eL: [245, 180], eR: [475, 180],
  wL: [212, 150], wR: [508, 150],
  hL: [322, 470], hR: [398, 470],
  kL: [305, 615], kR: [415, 615],
  aL: [299, 775], aR: [421, 775],
};

/* ---------- draw (back to front) ---------- */
bg([238, 243, 255]);
ellipse([360, 812], 150, 26, [40, 30, 60], 0.16);          // ground shadow

// legs: shorts (thigh) + skin (shin) + shoes
capsule(J.hL, J.kL, 28, SHORTS); capsule(J.kL, J.aL, 22, SKIN);
capsule(J.hR, J.kR, 28, SHORTS); capsule(J.kR, J.aR, 22, SKIN);
capsule([J.aL[0]-12, 792], [J.aL[0]+20, 792], 15, SHOE);
capsule([J.aR[0]+12, 792], [J.aR[0]-20, 792], 15, SHOE);

// torso (shirt) as an outlined polygon
const torso = [J.sL, J.sR, [J.hR[0]+6, J.hR[1]], [J.hL[0]-6, J.hL[1]]];
for (let i = 0; i < torso.length; i++) capsule(torso[i], torso[(i+1)%torso.length], 2, SHIRT); // thick outline edges
paint(280, 215, 440, 478, (x, y) => {
  let inside = false;
  for (let i = 0, j = torso.length-1; i < torso.length; j = i++) {
    const xi = torso[i][0], yi = torso[i][1], xj = torso[j][0], yj = torso[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj-xi)*(y-yi))/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}, SHIRT);

// arms (skin, short sleeves) + hands
capsule(J.sL, J.eL, 19, SKIN); capsule(J.eL, J.wL, 16, SKIN); disc(J.wL, 15, SKIN);
capsule(J.sR, J.eR, 19, SKIN); capsule(J.eR, J.wR, 16, SKIN); disc(J.wR, 15, SKIN);

// neck + head
capsule(J.neck, [360, 178], 16, SKIN);
disc(J.head, 60, SKIN);

// hair cap (over the scalp)
paint(290, 78, 430, 170, (x, y) => Math.hypot(x-360, y-138) <= 63 && (y <= 150 || Math.hypot(x-360, y-138) >= 56 && y <= 165), HAIR);

// face
ellipse([338, 150], 7, 10, OUTLINE);                        // eyes
ellipse([382, 150], 7, 10, OUTLINE);
ellipse([324, 170], 12, 9, CHEEK, 0.55);                    // cheeks
ellipse([396, 170], 12, 9, CHEEK, 0.55);
paint(330, 158, 392, 196, (x, y) =>                         // smile
  Math.abs(Math.hypot(x-360, y-156) - 24) <= 4 && y > 162 && x > 338 && x < 382, OUTLINE);

/* ---------- encode PNG ---------- */
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i*4]   = Math.max(0, Math.min(255, Math.round(buf[i*3])));
  rgba[i*4+1] = Math.max(0, Math.min(255, Math.round(buf[i*3+1])));
  rgba[i*4+2] = Math.max(0, Math.min(255, Math.round(buf[i*3+2])));
  rgba[i*4+3] = 255;
}
const crc32 = (() => {
  const t = new Uint32Array(256);
  for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}
  return (b)=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=t[(c^b[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
})();
function chunk(type, data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length,0);const b=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(b),0);return Buffer.concat([l,b,c]);}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
const stride = W*4, raw = Buffer.alloc((stride+1)*H);
for (let y=0;y<H;y++){ raw[y*(stride+1)]=0; rgba.copy(raw, y*(stride+1)+1, y*stride, y*stride+stride); }
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw,{level:9})), chunk("IEND", Buffer.alloc(0))]);
writeFileSync(new URL("../avatar-mockup.png", import.meta.url), png);
console.log("wrote avatar-mockup.png", W + "x" + H);
