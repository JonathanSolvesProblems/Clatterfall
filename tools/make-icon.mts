/**
 * Generates assets/icon.png (1024x1024) from the game's own palette using only
 * Node's zlib. No external tools, no image libraries, no AI art, the same
 * hand-drawn-primitives philosophy as the game itself.
 *
 *   npx tsx tools/make-icon.mts
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const S = 1024;
const buf = new Uint8Array(S * S * 3);

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

const PAPER = rgb(0xefe6d2);
const GRID = rgb(0xd9c9a6);
const WOOD = rgb(0xc99a5b);
const WOOD_HI = rgb(0xddbb84);
const WOOD_LO = rgb(0x7c5225);
const PIP = rgb(0xe4572e);
const PIP_RIM = rgb(0xa32d14);
const PIP_SPEC = rgb(0xffd9b0);
const BRASS = rgb(0xc88a34);

function px(x: number, y: number, c: [number, number, number], a = 1): void {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 3;
  for (let k = 0; k < 3; k++) {
    const prev = buf[i + k] as number;
    buf[i + k] = Math.round(prev * (1 - a) + (c[k] as number) * a);
  }
}

function fillRect(x0: number, y0: number, w: number, h: number, c: [number, number, number]): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c);
}

/** Anti-aliased filled disc. */
function disc(cx: number, cy: number, r: number, c: [number, number, number]): void {
  const r0 = r - 1;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r0) px(x, y, c);
      else if (d <= r + 1) px(x, y, c, Math.max(0, Math.min(1, r + 0.5 - d)));
    }
  }
}

/** Anti-aliased thick line (capsule), used for the ramps. */
function capsule(x1: number, y1: number, x2: number, y2: number, t: number, c: [number, number, number]): void {
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
      if (d <= t - 1) px(x, y, c);
      else if (d <= t) px(x, y, c, t - d);
    }
  }
}

// ---- compose ---------------------------------------------------------------
fillRect(0, 0, S, S, PAPER);

// engraved grid
for (let i = 128; i < S; i += 128) {
  for (let p = 0; p < S; p++) {
    px(i, p, GRID, 0.5);
    px(p, i, GRID, 0.5);
  }
}

// shaft walls
fillRect(150, 0, 34, S, WOOD_LO);
fillRect(840, 0, 34, S, WOOD_LO);
fillRect(180, 0, 5, S, WOOD_HI);
fillRect(836, 0, 5, S, WOOD_HI);

// dropper lip
fillRect(470, 60, 90, 22, BRASS);

// two ramps forming the zig-zag cascade
capsule(250, 500, 500, 610, 30, WOOD);
capsule(250, 470, 500, 580, 6, WOOD_HI);
capsule(770, 720, 520, 830, 30, WOOD);
capsule(770, 690, 520, 800, 6, WOOD_HI);

// Pip, the hero marble, mid-fall
disc(600, 330, 108, PIP_RIM);
disc(600, 330, 96, PIP);
disc(566, 296, 30, PIP_SPEC);

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
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour RGB
const raw = Buffer.alloc(S * (S * 3 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 3 + 1)] = 0; // filter: none
  Buffer.from(buf.buffer, y * S * 3, S * 3).copy(raw, y * (S * 3 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('assets', { recursive: true });
writeFileSync('assets/icon.png', png);
console.log(`assets/icon.png written: ${S}x${S}, ${(png.length / 1024).toFixed(1)} KB`);
