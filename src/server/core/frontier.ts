/**
 * Computes the buildable frontier and stores it as today's.
 *
 * The frontier is the corridor the marble ACTUALLY falls through once it leaves the
 * machine, not a wide fan of cells below its last contact. Building somewhere the
 * marble never visits earns nothing and dissolves, so offering those cells was
 * inviting people to waste their one part a day. It also makes the rule literally
 * true: you build where the marble goes.
 */
import type { Cell } from '../../shared/types';
import { cellId, frontierFromPath } from '../../shared/geometry';
import { setFrontier } from '../redis/schema';

export async function computeAndStoreFrontier(
  escape: { c: number; r: number },
  cells: Cell[],
  fallPath: { x: number; y: number }[] = []
): Promise<string[]> {
  const occupied = new Set(cells.map((c) => cellId(c.c, c.r)));
  const frontier = frontierFromPath(fallPath, escape.c, escape.r, occupied);
  await setFrontier(frontier);
  return frontier;
}
