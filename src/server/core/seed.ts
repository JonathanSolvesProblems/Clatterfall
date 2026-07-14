/**
 * The starter machine, so a freshly installed post is never an empty board.
 *
 * The layout below was produced offline by a greedy "extend the reach" builder
 * (simulate, see where the marble falls through, drop the next part into its
 * path, verify by re-simulating) and then CAPTURED here as a constant. Baking it
 * means install/reseed does zero physics to build the machine, only a single
 * sim to compute the opening frontier, which keeps the install handler well
 * under any time budget. Every part is genuinely on the marble's path (verified
 * by seed.test.ts), so no seed part ever decays as "untouched".
 */
import { redis } from '@devvit/web/server';
import type { Cell, PartId } from '../../shared/types';
import { cellId } from '../../shared/geometry';
import { simulate } from '../sim/engine';
import { computeAndStoreFrontier } from './frontier';
import { runDaily } from './dailyRun';
import { K, getLatestRunDate, resetLedger, serializeCell, setDeepestRow } from '../redis/schema';

const HOUSE = 'clatterfall';

const SEED_LAYOUT: Array<[c: number, r: number, part: PartId, orient: string]> = [
  [3, 1, 'ramp', 'R'],
  [4, 2, 'ramp', 'R'],
  [6, 3, 'ramp', 'R'],
  [7, 4, 'bouncer', 'L'],
  [5, 5, 'ramp', 'R'],
  [6, 6, 'ramp', 'R'],
  [6, 7, 'funnel', 'R'],
  [7, 8, 'ramp', 'L'],
  [5, 9, 'ramp', 'R'],
  [6, 10, 'chute', '0'],
  [7, 11, 'ramp', 'L'],
  [6, 12, 'ramp', 'R'],
  [7, 13, 'bouncer', 'L'],
  [6, 14, 'ramp', 'R'],
  [7, 15, 'ramp', 'L'],
  [5, 16, 'funnel', 'C'],
  [6, 17, 'ramp', 'R'],
  [7, 18, 'ramp', 'L'],
  [5, 19, 'chute', '0'],
  [6, 20, 'ramp', 'R'],
  [7, 21, 'ramp', 'L'],
  [5, 22, 'bouncer', 'U'],
  [6, 23, 'ramp', 'R'],
  [7, 24, 'ramp', 'L'],
  [5, 25, 'ramp', 'R'],
  [6, 26, 'ramp', 'R'],
];

export function starterCells(nowMs: number): Cell[] {
  return SEED_LAYOUT.map(([c, r, part, orient], i) => ({
    c,
    r,
    part,
    orient,
    owner: HOUSE,
    placedAt: nowMs - (SEED_LAYOUT.length - i) * 1000,
  }));
}

/**
 * Write the starter machine, set the deepest-row marker, and compute the opening
 * frontier so the board is playable the instant the post exists (before the first
 * daily cron ever fires).
 *
 * This does NOT run the machine. Callers that create a post must also call
 * `openMachine()` below, or the post has no stored run and opens dead.
 */
export async function seedStarterMachine(nowMs: number): Promise<number> {
  const cells = starterCells(nowMs);
  const fields: Record<string, string> = {};
  let deepest = 0;
  for (const cell of cells) {
    fields[cellId(cell.c, cell.r)] = serializeCell(cell);
    if (cell.r > deepest) deepest = cell.r;
  }
  await redis.hSet(K.cells, fields);
  await setDeepestRow(deepest);
  // Start the ledger at the seed size so `placed - dissolved === standing` is an
  // invariant from the very first second, not just from the first player's part.
  await resetLedger(cells.length);
  const sim = simulate(cells, deepest);
  await computeAndStoreFrontier(sim.escape, cells, sim.fallPath);
  return cells.length;
}

/**
 * Make sure a post has a run to show the moment it is opened.
 *
 * Without a stored run there is no `run:latest`, so `hasNewRunForUser` is false,
 * so the Build scene never auto-plays and the depth and record both read 0. Anyone
 * opening a fresh post (which is exactly what a judge does) would see a static
 * board of sticks and no marble, for up to 24 hours until the cron first fired.
 * The whole game would be dormant on the one surface that gets judged.
 *
 * Forced, so it takes a monotonic id and can never collide with the dated cron lock.
 * Idempotent: if a run already exists, this leaves it alone.
 */
export async function openMachine(nowMs: number): Promise<void> {
  if (await getLatestRunDate()) return;
  await runDaily(nowMs, { force: true });
}
