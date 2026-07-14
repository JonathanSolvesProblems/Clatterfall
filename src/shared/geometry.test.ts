import { describe, it, expect } from 'vitest';
import {
  basinCols,
  basinSideCol,
  catchFloorRow,
  cellId,
  coneCells,
  isInCone,
  parseCell,
  seasonGoalPx,
  seasonGoalRow,
} from './geometry';
import {
  CATCH_FLOOR_GAP,
  CELL,
  CONE_BASE_HALF,
  FRONTIER_DEPTH,
  GOAL_INTERVAL,
  GRID_COLS,
  MIN_FRONTIER_CELLS,
  SEASON1_GOAL_ROW,
} from './constants';

describe('cell id round-trip', () => {
  it('parses what it serializes', () => {
    for (const [c, r] of [
      [0, 0],
      [7, 123],
      [3, 5],
    ] as const) {
      expect(parseCell(cellId(c, r))).toEqual({ c, r });
    }
  });
});

describe('isInCone', () => {
  it('accepts the escape cell itself and the widening band', () => {
    const eC = 3;
    const eR = 10;
    expect(isInCone(eC, eR, eC, eR)).toBe(true); // dr=0, |0| <= 1
    expect(isInCone(eC + CONE_BASE_HALF, eR, eC, eR)).toBe(true); // edge at dr 0
    expect(isInCone(eC + CONE_BASE_HALF + 1, eR, eC, eR)).toBe(false); // too wide at dr 0
    expect(isInCone(eC + 2, eR + 1, eC, eR)).toBe(true); // half-width grows: 1+1=2
  });
  it('rejects above the escape row and beyond depth', () => {
    expect(isInCone(3, 9, 3, 10)).toBe(false); // above
    expect(isInCone(3, 20, 3, 10)).toBe(false); // beyond FRONTIER_DEPTH (4)
  });
  it('respects the shaft walls', () => {
    expect(isInCone(-1, 10, 0, 10)).toBe(false);
    expect(isInCone(GRID_COLS, 10, GRID_COLS - 1, 10)).toBe(false);
  });
});

describe('coneCells', () => {
  it('yields a genuinely 2D region (multiple columns and rows)', () => {
    const cells = coneCells(3, 10, new Set());
    const cols = new Set(cells.map((id) => parseCell(id).c));
    const rows = new Set(cells.map((id) => parseCell(id).r));
    expect(cols.size).toBeGreaterThan(1);
    expect(rows.size).toBeGreaterThan(1);
  });
  it('subtracts occupied cells', () => {
    const occ = new Set([cellId(3, 10)]);
    expect(coneCells(3, 10, occ)).not.toContain(cellId(3, 10));
  });
  it('jam-extends downward until enough free cells exist', () => {
    // Occupy the entire base cone; it must extend deeper to find room.
    const occ = new Set<string>();
    for (let dr = 0; dr <= 4; dr++) {
      for (let c = 0; c < GRID_COLS; c++) occ.add(cellId(c, 10 + dr));
    }
    const cells = coneCells(3, 10, occ);
    expect(cells.length).toBeGreaterThanOrEqual(MIN_FRONTIER_CELLS);
    // everything returned is empty and below the jammed rows
    for (const id of cells) {
      expect(occ.has(id)).toBe(false);
      expect(parseCell(id).r).toBeGreaterThan(14);
    }
  });
});

describe('catch floor', () => {
  it('sits a full frontier depth below the machine, so there is room to build', () => {
    expect(catchFloorRow(0)).toBe(CATCH_FLOOR_GAP);
    expect(catchFloorRow(50)).toBe(50 + CATCH_FLOOR_GAP);
  });

  /**
   * The frontier is the corridor the marble falls through after the machine lets go
   * of it. If the floor sat right under the machine, that corridor would be a row or
   * two tall and there would be nowhere meaningful to build: simulating a season with
   * a gap of 2 flatlined the record within a day and pruned 85% of everything placed.
   */
  it('leaves room for the whole buildable frontier beneath the machine', () => {
    expect(CATCH_FLOOR_GAP).toBeGreaterThanOrEqual(FRONTIER_DEPTH + 2);
  });
});

describe('seasons and basins', () => {
  it('deepens the goal each season', () => {
    expect(seasonGoalRow(1)).toBe(SEASON1_GOAL_ROW);
    expect(seasonGoalRow(2)).toBe(SEASON1_GOAL_ROW + GOAL_INTERVAL);
    expect(seasonGoalPx(1)).toBe(SEASON1_GOAL_ROW * CELL);
  });
  it('alternates basin sides', () => {
    expect(basinSideCol(40)).toBe(1); // left
    expect(basinSideCol(80)).toBe(GRID_COLS - 2); // right (cols 6,7)
    expect(basinSideCol(120)).toBe(1); // left again
    expect(basinCols(80)).toEqual([6, 7]);
  });
});
