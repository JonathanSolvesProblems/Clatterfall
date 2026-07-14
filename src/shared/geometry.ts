/**
 * Pure grid + frontier math, imported by BOTH client and server so a ghost's
 * "is this cell buildable" check and the server's authoritative frontier are
 * computed by identical logic. No side effects, no DOM.
 */
import {
  BASIN_WIDTH,
  CATCH_FLOOR_GAP,
  CELL,
  CONE_BASE_HALF,
  CORRIDOR_HALF,
  FRONTIER_DEPTH,
  GOAL_INTERVAL,
  GRID_COLS,
  MIN_BUILD_ROW,
  MIN_FRONTIER_CELLS,
  SEASON1_GOAL_ROW,
} from './constants';

export function cellId(c: number, r: number): string {
  return `${c}:${r}`;
}

export function parseCell(id: string): { c: number; r: number } {
  const i = id.indexOf(':');
  return { c: Number(id.slice(0, i)), r: Number(id.slice(i + 1)) };
}

/** Center of a cell in logical px. */
export function cellCenter(c: number, r: number): { x: number; y: number } {
  return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
}

export function colOfX(x: number): number {
  return Math.floor(x / CELL);
}
export function rowOfY(y: number): number {
  return Math.floor(y / CELL);
}
export function inBounds(c: number): boolean {
  return c >= 0 && c < GRID_COLS;
}

/** Cone membership: within depth rows below E and within the widening half-width. */
export function isInCone(
  c: number,
  r: number,
  eC: number,
  eR: number,
  depth: number = FRONTIER_DEPTH
): boolean {
  if (!inBounds(c)) return false;
  if (r < MIN_BUILD_ROW) return false; // never build in the dropper row
  const dr = r - eR;
  if (dr < 0 || dr > depth) return false;
  return Math.abs(c - eC) <= CONE_BASE_HALF + dr;
}

/**
 * All buildable empty cells for the day: the E-anchored cone, minus occupied
 * cells, jam-extended downward until at least {@link MIN_FRONTIER_CELLS} exist
 * (rows below the machine are always empty, so this always terminates).
 */
export function coneCells(eC: number, eR: number, occupied: Set<string>): string[] {
  let depth = FRONTIER_DEPTH;
  let cells: string[] = [];
  for (let guard = 0; guard < 400; guard++) {
    cells = [];
    for (let dr = 0; dr <= depth; dr++) {
      const r = eR + dr;
      if (r < MIN_BUILD_ROW) continue; // never build in the dropper row
      const half = CONE_BASE_HALF + dr;
      const lo = Math.max(0, eC - half);
      const hi = Math.min(GRID_COLS - 1, eC + half);
      for (let c = lo; c <= hi; c++) {
        const id = cellId(c, r);
        if (!occupied.has(id)) cells.push(id);
      }
    }
    if (cells.length >= MIN_FRONTIER_CELLS) break;
    depth++;
  }
  return cells;
}

/**
 * The buildable cells, restricted to the corridor the marble ACTUALLY falls through
 * after it leaves the machine.
 *
 * The plain cone is a wide fan below the marble's last contact, but the marble drops
 * in a narrow, nearly vertical corridor. Most cells in the fan are therefore places
 * the marble will never visit, so a part built there is touched by nothing, scores
 * nothing, and dissolves. Simulating a season showed the consequence: random players
 * never improved the record even once in 20 days, and careful players plateaued by
 * day 8, because the game kept inviting people to build where it could not matter.
 *
 * So the frontier is the fall corridor, widened by a column on each side to leave
 * room for a deliberate deflection. This also makes the rule mean what the game says
 * it means: you can build where the marble goes.
 *
 * `path` is the marble's trajectory after its final contact, in logical px.
 * Falls back to the plain cone if there is no usable path (e.g. the very first run).
 */
export function frontierFromPath(
  path: { x: number; y: number }[],
  eC: number,
  eR: number,
  occupied: Set<string>
): string[] {
  const corridor = new Set<number>();
  const rows = new Map<number, Set<number>>();
  for (const p of path) {
    const c = colOfX(p.x);
    const r = rowOfY(p.y);
    if (r < MIN_BUILD_ROW || r <= eR || r - eR > FRONTIER_DEPTH) continue;
    if (!rows.has(r)) rows.set(r, new Set());
    for (let d = -CORRIDOR_HALF; d <= CORRIDOR_HALF; d++) {
      const cc = c + d;
      if (inBounds(cc)) rows.get(r)?.add(cc);
    }
    corridor.add(r);
  }

  const cells: string[] = [];
  for (const r of [...corridor].sort((a, b) => a - b)) {
    for (const c of [...(rows.get(r) ?? [])].sort((a, b) => a - b)) {
      const id = cellId(c, r);
      if (!occupied.has(id)) cells.push(id);
    }
  }

  // Too few to be a real choice (a jam, or the marble came to rest immediately):
  // fall back to the cone so the board is never unbuildable.
  if (cells.length < MIN_FRONTIER_CELLS) return coneCells(eC, eR, occupied);
  return cells;
}

/** The soft catch-floor row: always below the machine so a rest state exists. */
export function catchFloorRow(deepestRow: number): number {
  return Math.max(deepestRow + CATCH_FLOOR_GAP, 2);
}

/** Season goal depth, in rows (S1 => 80, S2 => 120, ...). */
export function seasonGoalRow(season: number): number {
  return SEASON1_GOAL_ROW + (season - 1) * GOAL_INTERVAL;
}
export function seasonGoalPx(season: number): number {
  return seasonGoalRow(season) * CELL;
}

/** Left column of the checkpoint basin at a goal row (alternating sides). */
export function basinSideCol(goalRow: number): number {
  const idx = Math.round(goalRow / GOAL_INTERVAL); // 40->1, 80->2, 120->3
  // odd index => left basin at cols [1,2]; even => right basin at cols [6,7]
  return idx % 2 === 1 ? 1 : GRID_COLS - 1 - (BASIN_WIDTH - 1);
}

/** The two columns the basin occupies at a goal row. */
export function basinCols(goalRow: number): number[] {
  const side = basinSideCol(goalRow);
  const cols: number[] = [];
  for (let i = 0; i < BASIN_WIDTH; i++) cols.push(side + i);
  return cols;
}
