import { describe, it, expect } from 'vitest';
import { starterCells } from './seed';
import { simulate } from '../sim/engine';
import { cellId } from '../../shared/geometry';
import { CELL } from '../../shared/constants';

describe('starter machine is a real, well-behaved cascade', () => {
  const cells = starterCells(1_000_000);
  const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
  const res = simulate(cells, deepest);
  const touched = new Set(res.events.map((e) => e.cell));

  it('carries the marble a meaningful distance', () => {
    console.log(
      `[seed] reach=${res.reach}px (~row ${(res.reach / CELL).toFixed(1)}), ` +
        `touched ${touched.size}/${cells.length} parts, keyframes=${res.keyframes.length}`
    );
    expect(res.reach).toBeGreaterThan(CELL * 10);
  });

  it('has the marble actually contact EVERY seed part (so none decays)', () => {
    const missed = cells.filter((c) => !touched.has(cellId(c.c, c.r))).map((c) => `${c.c}:${c.r}`);
    expect(missed).toEqual([]);
    expect(touched.size).toBe(cells.length);
  });

  it('leaves plenty of room before the season goal', () => {
    expect(res.reach).toBeLessThan(CELL * 78);
    expect(deepest).toBeLessThan(78);
  });
});
