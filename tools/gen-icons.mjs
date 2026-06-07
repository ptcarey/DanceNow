// Generates the app's PNG icons with zero dependencies (Node's built-in zlib).
// iOS home-screen icons must be PNG (it ignores SVG), and it masks the icon to
// a rounded "squircle" itself — so we render a full-bleed, opaque square.
//
//   node tools/gen-icons.mjs
//
// Writes app-icon-180.png (Apple touch icon), app-icon-192.png and
// app-icon-512.png (web manifest) to the repo root.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/* --- minimal PNG encoder (8-bit RGBA) --- */
const crc32 = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* --- drawing --- */
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const PINK = [255, 143, 177], PURPLE = [155, 93, 229], BLUE = [76, 201, 240];
function gradient(t) {
  return t < 0.5 ? mix(PINK, PURPLE, t / 0.5) : mix(PURPLE, BLUE, (t - 0.5) / 0.5);
}

function star(cx, cy, R, r, points = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const ang = rot + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  return pts;
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const big = star(size * 0.5, size * 0.52, size * 0.30, size * 0.125);
  const small1 = star(size * 0.78, size * 0.26, size * 0.075, size * 0.032);
  const small2 = star(size * 0.24, size * 0.74, size * 0.055, size * 0.024);
  const ss = 4; // supersample for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = gradient((x + y) / (2 * size));
      let cov = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
          if (inPoly(px, py, big) || inPoly(px, py, small1) || inPoly(px, py, small2)) cov++;
        }
      }
      cov /= ss * ss;
      const o = (y * size + x) * 4;
      rgba[o] = Math.round(lerp(g[0], 255, cov));
      rgba[o + 1] = Math.round(lerp(g[1], 255, cov));
      rgba[o + 2] = Math.round(lerp(g[2], 255, cov));
      rgba[o + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

for (const s of [180, 192, 512]) {
  writeFileSync(new URL(`../app-icon-${s}.png`, import.meta.url), render(s));
  console.log(`wrote app-icon-${s}.png`);
}
