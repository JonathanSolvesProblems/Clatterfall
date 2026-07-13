/**
 * Self-heal: a bad part can only CAP distance, never brick the chain, and dead
 * parts dissolve so their cell reopens. Evaluated BEFORE the sim each day using
 * the PREVIOUS run's contact set (harden ordering), so a load-bearing part
 * (which the marble touched last run) is never removable.
 */
import { redis } from '@devvit/web/server';
import type { Cell } from '../../shared/types';
import { cellId } from '../../shared/geometry';
import { K, removeCells } from '../redis/schema';
import {
  DECAY_DOWNVOTE_THRESHOLD,
  DECAY_MIN_AGE_MS,
  DECAY_UNTOUCHED_RUNS,
} from '../../shared/constants';

/**
 * Returns the cellIds removed. Updates each standing cell's "missed" counter
 * (consecutive runs untouched) as a side effect.
 */
export async function evaluateDecay(
  cells: Cell[],
  lastTouched: Set<string>,
  nowMs: number
): Promise<string[]> {
  const remove: string[] = [];
  for (const cell of cells) {
    const id = cellId(cell.c, cell.r);
    const touched = lastTouched.has(id);
    const h = await redis.hGetAll(K.votes(id));
    const up = Number(h.up ?? '0');
    const down = Number(h.down ?? '0');
    const missed = touched ? 0 : Number(h.missed ?? '0') + 1;
    await redis.hSet(K.votes(id), { missed: String(missed) });

    const age = nowMs - cell.placedAt;
    const voteDecay =
      !touched && age >= DECAY_MIN_AGE_MS && down - up >= DECAY_DOWNVOTE_THRESHOLD;
    const untouchedDecay = missed >= DECAY_UNTOUCHED_RUNS && up - down <= 0;
    if (voteDecay || untouchedDecay) remove.push(id);
  }

  if (remove.length) {
    await removeCells(remove);
    await redis.del(...remove.map((id) => K.votes(id)));
    await redis.del(...remove.map((id) => K.voters(id)));
  }
  return remove;
}
