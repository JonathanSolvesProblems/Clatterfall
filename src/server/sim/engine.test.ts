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
  it('scores an empty machine ZERO: it carried the marble nowhere', () => {
    const res = simulate([], 0);
    expect(res.keyframes.length).toBeGreaterThan(2); // the marble still falls and rests

    // REACH is how deep the MACHINE carried the marble, not how deep the marble
    // ended up. An empty shaft carries it nowhere, however far it drops. Scoring the
    // marble's final depth instead would make reach a function of where the catch
    // floor happens to be, which is what let an untouched part in a far corner raise
    // the record by 192px while contributing nothing.
    expect(res.reach).toBe(0);
    expect(sum(res.contributions)).toBe(0);
    expect(res.cappingCell).toBe('');

    // The board must still be buildable: the escape falls back to the dropper.
    expect(res.escape).toEqual({ c: DROPPER_CELL.c, r: DROPPER_CELL.r });
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

  it('simulates a full-season machine in milliseconds, not seconds', () => {
    // A season's worth of play: ~200 parts is roughly 400 physics bodies, which is
    // the size the daily cron actually has to chew through late in a season. This
    // is the claim the README makes, so the test has to be the thing that proves it.
    const cells: Cell[] = [];
    let r = 1;
    for (let i = 0; i < 200; i++) {
      const c = i % 8;
      cells.push(cell(c, r, i % 5 === 0 ? 'bouncer' : 'ramp', i % 2 ? 'R' : 'L'));
      if (c === 7) r++;
    }
    const deepest = cells.reduce((m, x) => Math.max(m, x.r), 0);

    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const res = simulate(cells, deepest);
      runs.push(performance.now() - start);
      expect(res.reach).toBeGreaterThan(0);
    }
    runs.sort((a, b) => a - b);
    const median = runs[2] as number;
    console.log(`[perf] ${cells.length} parts (~${cells.length * 2 + 3} bodies): ${median.toFixed(1)}ms median`);

    // Measured at ~6ms locally. 250ms leaves a wide margin for slow CI boxes while
    // still failing loudly if someone makes the sim accidentally quadratic.
    expect(median).toBeLessThan(250);
  });
});
