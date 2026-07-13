/**
 * Validated, atomic part placement. Order matters (harden): claim the CELL
 * first (the contended resource) so a lost race never burns the user's daily
 * part; only then claim the user-day lock, rolling back the cell if the user
 * had already placed today. The part is PENDING: it does not move the marble
 * until the next daily run (the 24h "will my part help?" suspense).
 */
import type { Cell } from '../../shared/types';
import type { PlaceRequest, PlaceResponse } from '../../shared/api';
import { PARTS, isPartId } from '../../shared/parts';
import { cellId } from '../../shared/geometry';
import { recordPlacement } from '../redis/users';
import {
  claimCell,
  claimUserDay,
  clearFrontierCell,
  dateStr,
  getDeepestRow,
  getFrontier,
  incrPending,
  isFrontier,
  releaseCell,
  setDeepestRow,
} from '../redis/schema';

export async function placePart(userId: string, req: PlaceRequest): Promise<PlaceResponse> {
  const { c, r, part, orient } = req;

  if (!Number.isInteger(c) || !Number.isInteger(r) || !isPartId(part)) {
    return { ok: false, reason: 'invalid', message: 'Unknown part' };
  }
  if (!PARTS[part].orientations.includes(orient)) {
    return { ok: false, reason: 'invalid', message: 'Bad orientation' };
  }

  const id = cellId(c, r);
  if (!(await isFrontier(id))) {
    return { ok: false, reason: 'not_frontier', message: "That cell isn't open to build yet" };
  }

  const now = Date.now();
  const date = dateStr(now);
  const cell: Cell = { c, r, part, orient, owner: userId, placedAt: now };

  // 1) Claim the cell atomically (first-commit-wins).
  if (!(await claimCell(id, cell))) {
    return { ok: false, reason: 'occupied', message: 'That cell was just claimed. Pick another.' };
  }

  // 2) Claim the user's one-part-per-day lock; roll the cell back on failure.
  if (!(await claimUserDay(date, userId, id))) {
    await releaseCell(id);
    return { ok: false, reason: 'already_placed', message: "You've placed your part today. Back tomorrow." };
  }

  // 3) Bookkeeping.
  await clearFrontierCell(id);
  if (r > (await getDeepestRow())) await setDeepestRow(r);
  await incrPending();
  const streak = await recordPlacement(userId, date);

  return {
    ok: true,
    cell: { c, r, part, orient, owner: userId },
    frontier: await getFrontier(),
    streak,
  };
}
