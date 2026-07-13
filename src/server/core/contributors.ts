/**
 * Who carried the marble furthest on a given run.
 *
 * The per-cell credits already sum exactly to the run's reach (see the
 * high-water-mark accumulator in sim/engine.ts), so folding them up by owner
 * gives an honest "u/alice carried it 340px today" without any extra bookkeeping.
 * The house seed account is never listed: the leaderboard is for redditors.
 */
import { HOUSE_OWNER } from '../../shared/constants';
import { cellId } from '../../shared/geometry';
import type { Contributor } from '../../shared/types';

export function topContributors(
  cells: { c: number; r: number; owner: string }[],
  contributions: Record<string, number>,
  limit = 3,
): Contributor[] {
  const ownerByCell = new Map(cells.map((c) => [cellId(c.c, c.r), c.owner]));
  const sum = new Map<string, number>();
  for (const [cid, px] of Object.entries(contributions)) {
    const owner = ownerByCell.get(cid);
    if (!owner || owner === HOUSE_OWNER) continue;
    sum.set(owner, (sum.get(owner) ?? 0) + px);
  }
  return [...sum.entries()]
    .map(([name, px]) => ({ name, px: Math.round(px) }))
    .filter((x) => x.px > 0)
    .sort((a, b) => b.px - a.px || a.name.localeCompare(b.name)) // deterministic ties
    .slice(0, limit);
}
