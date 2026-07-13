import { describe, it, expect } from 'vitest';
import { simulate } from './engine';
import type { Cell } from '../../shared/types';
import { CELL, DROPPER_CELL } from '../../shared/constants';

const cell = (c: number, r: number, part: Cell['part'], orient: string): Cell => ({
  c,
  r,
  part,
  orient,
  owner: 'u_test',
  placedAt: 1,
});

function sum(contrib: Record<string, number>): number {
  return Object.values(contrib).reduce((a, b) => a + b, 0);
}

describe('simulate: headless matter-js (M0 load-bearing)', () => {
  it('runs an empty machine to the catch floor with a defined escape', () => {
    const res = simulate([], 0);
    expect(res.keyframes.length).toBeGreaterThan(2);
    expect(res.reach).toBeGreaterThan(0);
    expect(res.escape).toEqual({ c: DROPPER_CELL.c, r: DROPPER_CELL.r });
    // Nothing was touched, so all depth is unowned free-fall.
    expect(res.cappingCell).toBe('');
    expect(sum(res.contributions)).toBe(res.reach);
  });

  it('runs a real machine, attributes contributions that sum to REACH', () => {
    const cells: Cell[] = [
      cell(3, 3, 'ramp', 'R'),
      cell(4, 5, 'ramp', 'L'),
      cell(3, 7, 'bouncer', 'U'),
      cell(4, 9, 'funnel', 'C'),
      cell(4, 12, 'chute', '0'),
    ];
    const deepest = 12;
    const res = simulate(cells, deepest);

    expect(res.keyframes.length).toBeGreaterThan(5);
    expect(res.reach).toBeGreaterThan(CELL * 3); // fell past the first parts
    // High-water-mark attribution must reconcile to REACH exactly.
    expect(sum(res.contributions)).toBe(res.reach);
    // The marble should have touched at least one attributable part.
    const touchedParts = Object.keys(res.contributions).filter((k) => k !== '');
    expect(touchedParts.length).toBeGreaterThan(0);
    // Every collision event carries a timestamp within the run.
    for (const e of res.events) expect(e.t).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic: same input => identical keyframes', () => {
    const cells = [cell(3, 3, 'ramp', 'R'), cell(4, 6, 'bouncer', 'L')];
    const a = simulate(cells, 6);
    const b = simulate(cells, 6);
    expect(a.reach).toBe(b.reach);
    expect(a.keyframes).toEqual(b.keyframes);
  });

  it('finishes well within the step budget (perf sanity)', () => {
    const cells: Cell[] = [];
    for (let r = 3; r < 30; r += 2) cells.push(cell(3 + (r % 3), r, 'ramp', r % 2 ? 'R' : 'L'));
    const start = performance.now();
    const res = simulate(cells, 30);
    const ms = performance.now() - start;
    expect(res.reach).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
  });
});
