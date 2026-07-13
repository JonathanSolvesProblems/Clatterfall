/** Computes the E-anchored buildable cone and stores it as the current frontier. */
import type { Cell } from '../../shared/types';
import { cellId, coneCells } from '../../shared/geometry';
import { setFrontier } from '../redis/schema';

export async function computeAndStoreFrontier(
  escape: { c: number; r: number },
  cells: Cell[]
): Promise<string[]> {
  const occupied = new Set(cells.map((c) => cellId(c.c, c.r)));
  const frontier = coneCells(escape.c, escape.r, occupied);
  await setFrontier(frontier);
  return frontier;
}
