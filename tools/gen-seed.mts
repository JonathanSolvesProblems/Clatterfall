/**
 * Regenerates the SEED_LAYOUT constant in src/server/core/seed.ts.
 *
 * Run this whenever the physics changes (marble radius, part geometry, gravity),
 * because the baked starter layout is only valid for the physics that produced it.
 *
 * Strategy: grow the machine greedily the way the game rewards. For each new part,
 * try candidate cells just below the machine and keep the one that carries the
 * marble FARTHEST while actually being contacted. A part that increases reach is
 * by construction on the marble's path, so it is touched every run and never
 * decays as "untouched". Prefers tight (1-row) spacing so the machine reads as a
 * dense cascade rather than scattered sticks.
 *
 *   npx tsx tools/gen-seed.mts
 */
import { simulate } from '../src/server/sim/engine.ts';
import { PARTS } from '../src/shared/parts.ts';
import { cellId } from '../src/shared/geometry.ts';
import { CELL, DROPPER_X, GRID_COLS } from '../src/shared/constants.ts';
import type { Cell, Keyframe, PartId } from '../src/shared/types.ts';

const HOUSE = 'clatterfall';

// A dense, varied cascade. Mostly ramps (the reliable workhorse) with showpiece
// parts sprinkled in so the board shows off all four types.
const SEQUENCE: PartId[] = [
  'ramp', 'ramp', 'ramp', 'bouncer',
  'ramp', 'ramp', 'funnel', 'ramp',
  'ramp', 'chute', 'ramp', 'ramp',
  'bouncer', 'ramp', 'ramp', 'funnel',
  'ramp', 'ramp', 'chute', 'ramp',
  'ramp', 'bouncer', 'ramp', 'ramp',
  'ramp', 'ramp',
];

const clampCol = (c: number): number => Math.min(GRID_COLS - 1, Math.max(0, c));

function xAtDepth(kfs: Keyframe[], y: number): number | undefined {
  for (let i = 1; i < kfs.length; i++) {
    const a = kfs[i - 1] as Keyframe;
    const b = kfs[i] as Keyframe;
    if (a.y <= y && b.y >= y) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return undefined;
}

const deepestOf = (cells: Cell[]): number => cells.reduce((m, c) => Math.max(m, c.r), 0);

const cells: Cell[] = [];
const occupied = new Set<string>();
const colUse: Record<number, number> = {};

for (let i = 0; i < SEQUENCE.length; i++) {
  const part = SEQUENCE[i] as PartId;
  const orients = PARTS[part].orientations;
  const D = deepestOf(cells);
  const base = simulate(cells, Math.max(D, 1));

  const probeY = (D + 1) * CELL + CELL / 2;
  const last = base.keyframes[base.keyframes.length - 1];
  const px = xAtDepth(base.keyframes, probeY) ?? last?.x ?? DROPPER_X;
  const landCol = clampCol(Math.floor(px / CELL));

  // A chain-reaction machine reads as a MACHINE because the eye can trace a
  // continuous path through it. Parts that float two cells apart read as debris,
  // however many of them there are. So we optimise for CHAINING, not just density:
  //   - always take the tightest row (1 below the deepest part)
  //   - strongly prefer the next part to sit 1-2 columns from the previous one,
  //     so consecutive parts nearly touch and visibly hand off
  //   - steer toward a serpentine target column that sweeps left/right down the
  //     shaft, so the cascade fills the whole 8-wide board instead of hugging one
  //     wall and leaving half the board dead
  const prev = cells[cells.length - 1];
  let best: { cell: Cell; score: number } | null = null;

  // Evaluate BOTH a 1-row and a 2-row step and let the score decide. A hard
  // 1-row cascade is dense but physically cannot cross the shaft (the marble is
  // only deflected about a column per row), so the machine ends up pinned to one
  // wall. Allowing an occasional 2-row step buys the room to actually serpentine.
  for (const row of [D + 1, D + 2]) {
    // Serpentine target sweeping between col 1 and col 6 down the shaft.
    const phase = (row % 26) / 26;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0..1..0
    const targetCol = 1 + tri * 5;
    const rowPenalty = row === D + 1 ? 0 : 70; // prefer tight, but allow room to cross

    for (let dc = -4; dc <= 4; dc++) {
      const col = clampCol(landCol + dc);
      if (occupied.has(cellId(col, row))) continue;
      for (const orient of orients) {
        const cand: Cell = { c: col, r: row, part, orient, owner: HOUSE, placedAt: 0 };
        const res = simulate([...cells, cand], Math.max(row, D));
        if (!new Set(res.events.map((e) => e.cell)).has(cellId(col, row))) continue; // must be on-path
        const step = prev ? Math.abs(col - prev.c) : 1;
        const chain = 110 - 55 * Math.max(0, step - 2); // reward near-touching hand-offs

        // Steer the MARBLE, not just the part. A part is only legal where the
        // marble already goes, so the only way to fill the left half of the board
        // is to reward placements whose deflection carries Pip toward the target.
        const afterX = xAtDepth(res.keyframes, (row + 3) * CELL + CELL / 2);
        const resultCol = afterX === undefined ? col : clampCol(Math.floor(afterX / CELL));
        const steer = -80 * Math.abs(resultCol - targetCol);

        const rarity = 110 / (1 + (colUse[col] ?? 0));
        const score = res.reach * 0.12 + chain + steer + rarity - rowPenalty;
        if (!best || score > best.score) best = { cell: cand, score };
      }
    }
  }

  if (best) {
    cells.push(best.cell);
    occupied.add(cellId(best.cell.c, best.cell.r));
    colUse[best.cell.c] = (colUse[best.cell.c] ?? 0) + 1;
  }
}

// ---- validate + report ------------------------------------------------------
const deepest = deepestOf(cells);
const final = simulate(cells, deepest);
const touched = new Set(final.events.map((e) => e.cell));
const missed = cells.filter((c) => !touched.has(cellId(c.c, c.r)));
const cols = new Set(cells.map((c) => c.c));
const density = cells.length / Math.max(deepest, 1);

console.log('\n=== generated seed ===');
console.log(`parts=${cells.length}  deepest=row ${deepest}  reach=${final.reach}px (row ${(final.reach / CELL).toFixed(1)})`);
console.log(`touched=${touched.size}/${cells.length}  missed=[${missed.map((c) => `${c.c}:${c.r}`).join(', ')}]`);
console.log(`density=${density.toFixed(2)} parts/row   columns used=${[...cols].sort((a, b) => a - b).join(',')}`);
console.log('\n--- paste into src/server/core/seed.ts ---\n');
console.log(cells.map((c) => `  [${c.c}, ${c.r}, '${c.part}', '${c.orient}'],`).join('\n'));
console.log('');
