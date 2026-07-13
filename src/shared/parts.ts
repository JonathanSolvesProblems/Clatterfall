/**
 * The four-part palette. Each part is defined ONCE, in logical px relative to
 * its cell center, as a set of {@link Primitive}s. The server turns these into
 * static Matter bodies; the client draws the identical shapes. One source of
 * truth => the physics surface and the picture can never disagree.
 */
import type { PartDef, PartId, Primitive } from './types';

const DEG = Math.PI / 180;

/** Rotate primitives around the cell center by `deg` (for 4-way parts). */
function rotate(prims: Primitive[], deg: number): Primitive[] {
  if (deg === 0) return prims;
  const a = deg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return prims.map((p) => {
    const x = p.x * cos - p.y * sin;
    const y = p.x * sin + p.y * cos;
    if (p.kind === 'circle') return { kind: 'circle', x, y, r: p.r };
    return { kind: 'box', x, y, w: p.w, h: p.h, angle: p.angle + a };
  });
}

/** Lay small boxes tangent to a circle to form a smooth concave arc surface. */
function arc(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  segments: number,
  thickness: number
): Primitive[] {
  const prims: Primitive[] = [];
  const step = (endDeg - startDeg) / segments;
  const segLen = (2 * Math.PI * radius * Math.abs(step)) / 360 + 3; // slight overlap
  for (let i = 0; i < segments; i++) {
    const mid = (startDeg + step * (i + 0.5)) * DEG;
    const x = cx + Math.cos(mid) * radius;
    const y = cy + Math.sin(mid) * radius;
    prims.push({ kind: 'box', x, y, w: segLen, h: thickness, angle: mid + Math.PI / 2 });
  }
  return prims;
}

const ramp: PartDef = {
  id: 'ramp',
  name: 'Straight Ramp',
  material: 'wood',
  restitution: 0.12,
  friction: 0.35,
  orientations: ['R', 'L'],
  primitives: (o) => {
    // 'R' descends to the right ("\"), 'L' descends to the left ("/").
    const angle = o === 'L' ? -0.5 : 0.5;
    return [{ kind: 'box', x: 0, y: -1, w: 62, h: 17, angle }];
  },
};

const chute: PartDef = {
  id: 'chute',
  name: 'Curved Chute',
  material: 'wood',
  restitution: 0.08,
  friction: 0.3,
  orientations: ['0', '90', '180', '270'],
  // Base '0': a concave quarter-pipe that catches a falling marble on the left
  // and curves it down-and-right toward the cell's bottom.
  primitives: (o) => rotate(arc(28, -28, 46, 90, 180, 7, 16), Number(o)),
};

const bouncer: PartDef = {
  id: 'bouncer',
  name: 'Bouncer',
  material: 'steel',
  restitution: 0.85,
  friction: 0.1,
  orientations: ['U', 'L', 'R'],
  primitives: (o) => {
    const angle = o === 'L' ? -0.32 : o === 'R' ? 0.32 : 0;
    return [{ kind: 'box', x: 0, y: 6, w: 50, h: 14, angle }];
  },
};

const funnel: PartDef = {
  id: 'funnel',
  name: 'Funnel',
  material: 'wood',
  restitution: 0.08,
  friction: 0.25,
  orientations: ['C', 'L', 'R'],
  primitives: (o) => {
    // Walls sit wide enough apart that the (chunky) marble always fits the throat.
    const gap = o === 'L' ? -13 : o === 'R' ? 13 : 0;
    return [
      { kind: 'box', x: gap - 21, y: 0, w: 40, h: 12, angle: 0.7 },
      { kind: 'box', x: gap + 21, y: 0, w: 40, h: 12, angle: -0.7 },
    ];
  },
};

export const PARTS: Record<PartId, PartDef> = { ramp, chute, bouncer, funnel };

/** Palette order (left-to-right in the UI). */
export const PART_LIST: readonly PartId[] = ['ramp', 'chute', 'bouncer', 'funnel'];

export function isPartId(v: string): v is PartId {
  return v === 'ramp' || v === 'chute' || v === 'bouncer' || v === 'funnel';
}
