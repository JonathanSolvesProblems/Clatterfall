/**
 * Property/fuzz test for the core guarantee: THE MACHINE CAN NEVER BRICK.
 *
 * Simulates many randomized "communities" playing many days: each day, random
 * players drop random parts into random legal frontier cells, then the machine
 * re-runs. Whatever they build, these invariants must always hold:
 *   - the sim terminates and produces a usable keyframe path
 *   - the marble always comes to rest and always travels SOME distance
 *   - the marble is never wedged above the machine (reach grows with the machine)
 *   - a buildable frontier always exists (the game is never unplayable)
 *   - the escape point stays inside the shaft
 *
 * This is what protects the chunky-marble physics: a 34px marble in a 64px cell
 * has much less clearance, so wedging/blocking is the real risk. Fuzzing beats
 * hand-waving about geometry.
 */
import { describe, it, expect } from 'vitest';
import { simulate } from './engine';
import { starterCells } from '../core/seed';
import { PARTS, PART_LIST } from '../../shared/parts';
import { cellId, coneCells, parseCell } from '../../shared/geometry';
import { GRID_COLS, MAX_KEYFRAMES, MIN_BUILD_ROW, MIN_FRONTIER_CELLS } from '../../shared/constants';
import type { Cell, PartId } from '../../shared/types';

/** Deterministic RNG so a failure is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const DAYS = 18;
const PLACERS_PER_DAY = 4;

/**
 * Plays out a randomized season, mirroring exactly what dailyRun does: simulate,
 * dissolve any jamming part, advance the frontier, let a random crowd build.
 */
function playOutSeason(seed: number, startCells: Cell[]): void {
  const rand = rng(seed);
  let cells = [...startCells];
  const occupied = new Set(cells.map((c) => cellId(c.c, c.r)));
  let jams = 0;

  for (let day = 1; day <= DAYS; day++) {
    const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
    const res = simulate(cells, deepest);

    // --- invariants on the run itself ---
    expect(Number.isFinite(res.reach)).toBe(true);
    expect(res.reach).toBeGreaterThan(0); // Pip always travels somewhere
    expect(res.keyframes.length).toBeGreaterThan(1);
    expect(res.keyframes.length).toBeLessThanOrEqual(MAX_KEYFRAMES + 2);

    // Escape point must stay inside the shaft.
    expect(res.escape.c).toBeGreaterThanOrEqual(0);
    expect(res.escape.c).toBeLessThan(GRID_COLS);
    expect(res.escape.r).toBeGreaterThanOrEqual(0);

    // --- SELF-HEAL: a jam must dissolve, exactly as dailyRun does ---
    if (res.stuckOn) {
      jams++;
      expect(occupied.has(res.stuckOn)).toBe(true); // it is a real placed part
      cells = cells.filter((c) => cellId(c.c, c.r) !== res.stuckOn);
      occupied.delete(res.stuckOn);
      // After dissolving, the very next run must NOT jam on the same cell.
      const after = simulate(cells, cells.reduce((m, c) => Math.max(m, c.r), 0));
      expect(after.stuckOn).not.toBe(res.stuckOn);
    }

    // --- the game must remain playable: a buildable frontier always exists ---
    const frontier = coneCells(res.escape.c, res.escape.r, occupied);
    expect(frontier.length).toBeGreaterThanOrEqual(MIN_FRONTIER_CELLS);
    for (const id of frontier) {
      expect(occupied.has(id)).toBe(false);
      expect(parseCell(id).r).toBeGreaterThanOrEqual(MIN_BUILD_ROW); // never the dropper row
    }

    // --- a random crowd places random parts in random legal cells ---
    for (let p = 0; p < PLACERS_PER_DAY; p++) {
      const open = frontier.filter((id) => !occupied.has(id));
      if (!open.length) break;
      const id = open[Math.floor(rand() * open.length)] as string;
      const { c, r } = parseCell(id);
      const part = PART_LIST[Math.floor(rand() * PART_LIST.length)] as PartId;
      const orients = PARTS[part].orientations;
      const orient = orients[Math.floor(rand() * orients.length)] as string;
      cells.push({ c, r, part, orient, owner: `u${p}`, placedAt: day });
      occupied.add(id);
    }
  }

  // Whatever the crowd built, the machine still runs at the end of the season.
  const final = simulate(cells, cells.reduce((m, c) => Math.max(m, c.r), 0));
  expect(final.reach).toBeGreaterThan(0);
  expect(jams).toBeLessThan(DAYS); // jams are the exception, not every single day
}

describe('fuzz: the machine can never brick', () => {
  it('survives many randomized communities playing many days (from the seed)', { timeout: 120_000 }, () => {
    const seedCells = starterCells(1_000_000);
    for (let s = 1; s <= 8; s++) playOutSeason(s * 7919, seedCells);
  });

  it('survives randomized play from a completely empty board', { timeout: 120_000 }, () => {
    for (let s = 1; s <= 8; s++) playOutSeason(s * 104729, []);
  });

  it('an adversarial wall of parts across every column still lets the marble through or past', () => {
    // Worst case a griefing crowd could build: fill entire rows edge to edge.
    for (const part of PART_LIST) {
      const cells: Cell[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const orients = PARTS[part].orientations;
        cells.push({ c, r: 4, part, orient: orients[0] as string, owner: 'grief', placedAt: 1 });
        cells.push({ c, r: 8, part, orient: orients[0] as string, owner: 'grief', placedAt: 1 });
      }
      const res = simulate(cells, 8);
      // The catch floor sits below the deepest part, so the marble must still
      // come to rest with a real reach and a valid escape. It can be capped
      // short, but it can never be lost or stuck forever.
      expect(res.reach).toBeGreaterThan(0);
      expect(res.keyframes.length).toBeGreaterThan(1);
      expect(res.escape.c).toBeGreaterThanOrEqual(0);
      expect(res.escape.c).toBeLessThan(GRID_COLS);
    }
  });
});
