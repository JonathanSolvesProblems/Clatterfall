/**
 * Generates assets/thumbnail.png (1200x800, the 3:2 ratio Devpost asks for) from
 * the game's own palette, using only Node's zlib. Same philosophy as the game:
 * every pixel drawn from primitives, no image libraries, no AI art.
 *
 *   npx tsx tools/make-thumbnail.mts
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1200;
const H = 800;
const buf = new Uint8Array(W * H * 3);

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

const PAPER = rgb(0xefe6d2);
const GRID = rgb(0xd9c9a6);
const WOOD = rgb(0xc99a5b);
const WOOD_HI = rgb(0xddbb84);
const WOOD_LO = rgb(0x7c5225);
const STEEL = rgb(0x3e8f86);
const PIP = rgb(0xe4572e);
const PIP_RIM = rgb(0xa32d14);
const PIP_SPEC = rgb(0xffd9b0);
const BRASS = rgb(0xc88a34);
const INK = rgb(0x2e2a24);

function px(x: number, y: number, c: [number, number, number], a = 1): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  for (let k = 0; k < 3; k++) {
    const prev = buf[i + k] as number;
    buf[i + k] = Math.round(prev * (1 - a) + (c[k] as number) * a);
  }
}

function fillRect(x0: number, y0: number, w: number, h: number, c: [number, number, number], a = 1): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c, a);
}

function disc(cx: number, cy: number, r: number, c: [number, number, number], a = 1): void {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r - 1) px(x, y, c, a);
      else if (d <= r + 1) px(x, y, c, a * Math.max(0, Math.min(1, r + 0.5 - d)));
    }
  }
}

/** Anti-aliased thick line (capsule) = a ramp. */
function capsule(x1: number, y1: number, x2: number, y2: number, t: number, c: [number, number, number], a = 1): void {
  const minx = Math.floor(Math.min(x1, x2) - t - 2);
  const maxx = Math.ceil(Math.max(x1, x2) + t + 2);
  const miny = Math.floor(Math.min(y1, y2) - t - 2);
  const maxy = Math.ceil(Math.max(y1, y2) + t + 2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      let u = ((x - x1) * dx + (y - y1) * dy) / len2;
      u = Math.max(0, Math.min(1, u));
      const d = Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy));
      if (d <= t - 1) px(x, y, c, a);
      else if (d <= t) px(x, y, c, a * (t - d));
    }
  }
}

/** A wood ramp with its shadow and bevel. */
function ramp(x1: number, y1: number, x2: number, y2: number): void {
  capsule(x1 + 4, y1 + 7, x2 + 4, y2 + 7, 13, INK, 0.12); // shadow
  capsule(x1, y1, x2, y2, 13, WOOD);
  capsule(x1, y1 - 4, x2, y2 - 4, 3, WOOD_HI); // bevel
}

// ---- compose ---------------------------------------------------------------
fillRect(0, 0, W, H, PAPER);

// engraved grid
for (let i = 0; i < W; i += 80) for (let p = 0; p < H; p++) px(i, p, GRID, 0.45);
for (let i = 0; i < H; i += 80) for (let p = 0; p < W; p++) px(p, i, GRID, 0.45);

// the shaft, centred
const SL = 330;
const SR = 870;
fillRect(SL - 26, 0, 26, H, WOOD_LO);
fillRect(SR, 0, 26, H, WOOD_LO);
fillRect(SL - 6, 0, 4, H, WOOD_HI);
fillRect(SR + 2, 0, 4, H, WOOD_HI);

// dropper lip
fillRect(575, 40, 70, 16, BRASS);

// the cascade: a zig-zag of ramps + one steel bouncer
ramp(380, 210, 600, 285);
ramp(830, 375, 610, 450);
capsule(430, 560, 560, 560, 11, STEEL); // bouncer pad
capsule(430, 553, 560, 553, 3, rgb(0x5fb4a9));
ramp(600, 660, 830, 735);

// Pip mid-fall, with a motion trail
for (let i = 5; i >= 1; i--) {
  disc(660 + i * 9, 150 - i * 26, 30 - i * 2.4, PIP, 0.1 * (6 - i));
}
disc(655, 168, 40, PIP_RIM);
disc(655, 168, 34, PIP);
disc(643, 156, 11, PIP_SPEC);

// brass depth ruler down the right gutter, with a vermilion record pin
fillRect(1120, 60, 14, H - 120, rgb(0xe4d7bc));
fillRect(1120, 60, 14, 430, rgb(0xe8b25a));
for (let i = 0; i <= 10; i++) fillRect(1108, 60 + i * ((H - 120) / 10), 10, 2, BRASS);
for (let dy = -8; dy <= 8; dy++) {
  const half = 8 - Math.abs(dy);
  fillRect(1136, 490 + dy, half + 4, 1, PIP_RIM);
}

// ---- encode PNG ------------------------------------------------------------
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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('assets', { recursive: true });
writeFileSync('assets/thumbnail.png', png);
console.log(`assets/thumbnail.png written: ${W}x${H} (3:2), ${(png.length / 1024).toFixed(1)} KB`);
