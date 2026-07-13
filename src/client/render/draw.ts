/**
 * Part + marble drawing. Everything is drawn from Phaser Graphics primitives in
 * LOGICAL px (no sprite sheets, no images, no AI art) using the exact same
 * {@link Primitive}s the server simulates, so the picture matches the physics.
 * The recipe per part: soft long shadow (light upper-left) + matte fill + a
 * single bevel edge, the "Sunlit Workbench" look.
 */
import type Phaser from 'phaser';
import type { PartId, Primitive } from '../../shared/types';
import { PARTS } from '../../shared/parts';
import { COLORS, MATERIAL } from '../../shared/theme';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

// Light comes from the upper-left, so every part throws a soft shadow down-right.
// A deeper offset makes the parts read as physical objects sitting on the board.
const SHADOW_DX = 4;
const SHADOW_DY = 7;

function rotRectCorners(cx: number, cy: number, w: number, h: number, angle: number): [Pt, Pt, Pt, Pt] {
  const hw = w / 2;
  const hh = h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (lx: number, ly: number): Pt => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
  return [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)];
}

function fillPoly(g: G, pts: Pt[]): void {
  const p0 = pts[0];
  if (!p0) return;
  g.beginPath();
  g.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p) g.lineTo(p.x, p.y);
  }
  g.closePath();
  g.fillPath();
}

function primShadow(g: G, p: Primitive, cx: number, cy: number): void {
  g.fillStyle(COLORS.ink, 0.18);
  const ox = cx + SHADOW_DX;
  const oy = cy + SHADOW_DY;
  if (p.kind === 'circle') g.fillCircle(ox + p.x, oy + p.y, p.r);
  else fillPoly(g, rotRectCorners(ox + p.x, oy + p.y, p.w, p.h, p.angle));
}

function primFill(g: G, p: Primitive, cx: number, cy: number, fill: number, hi: number, lo: number, alpha: number): void {
  if (p.kind === 'circle') {
    g.fillStyle(fill, alpha);
    g.fillCircle(cx + p.x, cy + p.y, p.r);
    g.fillStyle(hi, alpha * 0.5);
    g.fillCircle(cx + p.x - p.r * 0.28, cy + p.y - p.r * 0.28, p.r * 0.4);
    return;
  }
  const [tl, tr, br, bl] = rotRectCorners(cx + p.x, cy + p.y, p.w, p.h, p.angle);
  g.fillStyle(fill, alpha);
  fillPoly(g, [tl, tr, br, bl]);
  g.lineStyle(2, hi, alpha * 0.9);
  g.lineBetween(tl.x, tl.y, tr.x, tr.y);
  g.lineStyle(2, lo, alpha * 0.8);
  g.lineBetween(bl.x, bl.y, br.x, br.y);
}

/** Draw a placed part into `g`, centered on logical (cx, cy). */
export function drawPart(
  g: G,
  part: PartId,
  orient: string,
  cx: number,
  cy: number,
  opts?: { alpha?: number; withShadow?: boolean; tint?: number }
): void {
  const def = PARTS[part];
  const mat = MATERIAL[def.material];
  const fill = opts?.tint ?? mat[0];
  const hi = mat[1];
  const lo = mat[2];
  const alpha = opts?.alpha ?? 1;
  const prims = def.primitives(orient);
  if (opts?.withShadow !== false) for (const p of prims) primShadow(g, p, cx, cy);
  for (const p of prims) primFill(g, p, cx, cy, fill, hi, lo, alpha);
}

/** Draw the vermilion hero marble (Pip) with a soft shadow + specular. */
export function drawMarble(g: G, x: number, y: number, r: number, alpha = 1): void {
  g.fillStyle(COLORS.ink, 0.16 * alpha);
  g.fillCircle(x + SHADOW_DX, y + SHADOW_DY, r);
  g.fillStyle(COLORS.pipRim, alpha);
  g.fillCircle(x, y, r);
  g.fillStyle(COLORS.pip, alpha);
  g.fillCircle(x, y, r * 0.86);
  g.fillStyle(COLORS.pipSwirl, alpha * 0.7);
  g.fillCircle(x + r * 0.18, y + r * 0.1, r * 0.32);
  g.fillStyle(COLORS.pipSpec, alpha);
  g.fillCircle(x - r * 0.32, y - r * 0.34, r * 0.26);
}
