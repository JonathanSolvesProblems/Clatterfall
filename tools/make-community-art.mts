/**
 * Generates the subreddit's community icon and banner from the game's own palette,
 * using nothing but Node's zlib. Same philosophy as the app icon and the game itself:
 * every pixel is drawn from primitives, there is no AI art and no asset packs
 * anywhere in this project, and that claim has to survive someone checking.
 *
 *   npx tsx tools/make-community-art.mts
 *
 * Writes:
 *   assets/community-icon.png    256x256   (Reddit community icon)
 *   assets/community-banner.png  1920x384  (Reddit community banner)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// The game's palette, verbatim from src/shared/theme.ts.
const PAPER = rgb(0xefe6d2);
const PAPER_HI = rgb(0xf7f0de);
const GRID = rgb(0xd9c9a6);
const WOOD = rgb(0xc99a5b);
const WOOD_HI = rgb(0xddbb84);
const WOOD_LO = rgb(0x7c5225);
const PIP = rgb(0xe4572e);
const PIP_RIM = rgb(0xa32d14);
const PIP_SPEC = rgb(0xffd9b0);
const BRASS = rgb(0xc88a34);

/** A tiny RGB canvas with anti-aliased primitives. */
class Canvas {
  readonly buf: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.buf = new Uint8Array(w * h * 3);
  }
  px(x: number, y: number, c: [number, number, number], a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    for (let k = 0; k < 3; k++) {
      const prev = this.buf[i + k] as number;
      this.buf[i + k] = Math.round(prev * (1 - a) + (c[k] as number) * a);
    }
  }
  rect(x0: number, y0: number, w: number, h: number, c: [number, number, number], a = 1): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, c, a);
  }
  disc(cx: number, cy: number, r: number, c: [number, number, number], a = 1): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r - 1) this.px(x, y, c, a);
        else if (d <= r + 0.5) this.px(x, y, c, a * Math.max(0, Math.min(1, r + 0.5 - d)));
      }
    }
  }
  /** Rounded thick line: the ramps. */
  capsule(x1: number, y1: number, x2: number, y2: number, t: number, c: [number, number, number]): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - t - 2); y <= Math.ceil(Math.max(y1, y2) + t + 2); y++) {
      for (let x = Math.floor(Math.min(x1, x2) - t - 2); x <= Math.ceil(Math.max(x1, x2) + t + 2); x++) {
        let u = ((x - x1) * dx + (y - y1) * dy) / len2;
        u = Math.max(0, Math.min(1, u));
        const d = Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy));
        if (d <= t - 1) this.px(x, y, c);
        else if (d <= t) this.px(x, y, c, t - d);
      }
    }
  }
  /** A ramp with its lit top edge and a soft drop shadow, as drawn in the game. */
  ramp(x1: number, y1: number, x2: number, y2: number, t: number): void {
    this.capsule(x1 + t * 0.25, y1 + t * 0.5, x2 + t * 0.25, y2 + t * 0.5, t, WOOD_LO);
    this.capsule(x1, y1, x2, y2, t, WOOD);
    this.capsule(x1, y1 - t * 0.45, x2, y2 - t * 0.45, t * 0.18, WOOD_HI);
  }
  marble(cx: number, cy: number, r: number): void {
    this.disc(cx, cy, r, PIP_RIM);
    this.disc(cx, cy, r * 0.87, PIP);
    this.disc(cx - r * 0.32, cy - r * 0.32, r * 0.26, PIP_SPEC);
  }
}

// ---- PNG encoder (no libraries) --------------------------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(cv: Canvas, path: string): void {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour RGB
  const stride = cv.w * 3;
  const raw = Buffer.alloc(cv.h * (stride + 1));
  for (let y = 0; y < cv.h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(cv.buf.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  mkdirSync('assets', { recursive: true });
  writeFileSync(path, png);
  console.log(`  ${path.padEnd(30)} ${cv.w}x${cv.h}  ${(png.length / 1024).toFixed(1)} KB`);
}

/** Faint engraved grid, the same graph-paper board the game is played on. */
function board(cv: Canvas, step: number): void {
  cv.rect(0, 0, cv.w, cv.h, PAPER);
  for (let x = step; x < cv.w; x += step) for (let y = 0; y < cv.h; y++) cv.px(x, y, GRID, 0.45);
  for (let y = step; y < cv.h; y += step) for (let x = 0; x < cv.w; x++) cv.px(x, y, GRID, 0.45);
}

// ---- 1. COMMUNITY ICON: the marble caught mid-cascade -----------------------
{
  const S = 256;
  const cv = new Canvas(S, S);
  board(cv, 32);

  // Shaft walls, so it reads as the machine and not just an abstract mark.
  cv.rect(24, 0, 10, S, WOOD_LO);
  cv.rect(222, 0, 10, S, WOOD_LO);

  /**
   * Reddit renders this at about 40px. Anything fussy turns to mush at that size,
   * so it is deliberately three chunky beats and one very large marble: the
   * silhouette has to survive being shrunk to a thumbnail in a sidebar.
   */
  cv.ramp(52, 118, 138, 148, 15);
  cv.ramp(206, 182, 118, 212, 15);

  // Pip, mid-fall, unmistakably the hero.
  cv.marble(146, 70, 44);

  writePng(cv, 'assets/community-icon.png');
}

// ---- 2. BANNER: one continuous machine, the marble threading it -------------
{
  const W = 1920;
  const H = 384;
  const cv = new Canvas(W, H);

  // Warm paper wash, slightly brighter top-left like the in-game board.
  cv.rect(0, 0, W, H, PAPER);
  for (let y = 0; y < H; y++) {
    const a = Math.max(0, 0.55 - y / H);
    for (let x = 0; x < W; x++) cv.px(x, y, PAPER_HI, a * (1 - x / (W * 1.6)));
  }
  for (let x = 64; x < W; x += 64) for (let y = 0; y < H; y++) cv.px(x, y, GRID, 0.35);
  for (let y = 64; y < H; y += 64) for (let x = 0; x < W; x++) cv.px(x, y, GRID, 0.35);

  // A brass rule along the bottom: the depth ruler, the thing that measures the run.
  cv.rect(0, H - 14, W, 4, BRASS, 0.8);
  for (let x = 0; x < W; x += 64) cv.rect(x, H - 24, 2, 10, BRASS, 0.45);

  /**
   * One continuous descent, left to right. A marble run unrolled.
   *
   * Every ramp hands off to the next, so the eye can trace a single path through
   * it, which is the whole idea of the game. Scattered sticks read as debris no
   * matter how nicely they are drawn.
   *
   * The left third stays calm on purpose: Reddit lays the community icon and name
   * over it, and anything busy there just gets buried.
   */
  const RUN: [number, number, number, number][] = [
    [400, 104, 570, 130],
    [640, 150, 810, 176],
    [880, 196, 1050, 222],
    [1120, 242, 1290, 268],
    [1360, 288, 1530, 314],
  ];
  for (const [x1, y1, x2, y2] of RUN) cv.ramp(x1, y1, x2, y2, 13);

  // Pip, mid-roll down the third ramp. Sitting ON the surface, not buried in it:
  // the ramp centreline at this x, minus half the ramp thickness, minus his radius.
  const R = 25;
  const [rx1, ry1, rx2, ry2] = RUN[2] as [number, number, number, number];
  const px0 = 980;
  const t = (px0 - rx1) / (rx2 - rx1);
  const py0 = ry1 + t * (ry2 - ry1) - 13 - R + 4;

  // Motion trail, fading back up the ramp he just came down.
  const ux = (rx2 - rx1) / Math.hypot(rx2 - rx1, ry2 - ry1);
  const uy = (ry2 - ry1) / Math.hypot(rx2 - rx1, ry2 - ry1);
  for (let i = 5; i >= 1; i--) {
    cv.disc(px0 - ux * i * 16, py0 - uy * i * 16, R * (1 - i * 0.11), PIP, 0.5 - i * 0.075);
  }
  cv.marble(px0, py0, R);

  // Where the run is headed: the marble at rest, deep, on the brass.
  cv.disc(1700, 344, 21, PIP_RIM);
  cv.disc(1700, 344, 18, PIP);
  cv.disc(1694, 338, 5, PIP_SPEC);

  writePng(cv, 'assets/community-banner.png');
}

console.log('\nBoth generated from the game palette. No AI art, no asset packs, no image libraries.');
