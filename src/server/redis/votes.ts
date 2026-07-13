/** Community up/down votes on placed parts (feeds the self-heal decay path). */
import { redis } from '@devvit/web/server';
import { K } from './schema';

export type VoteCounts = { up: number; down: number; missed: number };

export async function getVotes(cellId: string): Promise<VoteCounts> {
  const h = await redis.hGetAll(K.votes(cellId));
  return { up: Number(h.up ?? '0'), down: Number(h.down ?? '0'), missed: Number(h.missed ?? '0') };
}

/**
 * One vote per user per cell (first vote wins), counted atomically.
 * `applied` is false when this user had already voted, so the UI can say so
 * rather than silently pretending the vote landed.
 */
export async function castVote(
  cellId: string,
  dir: 1 | -1,
  userId: string
): Promise<VoteCounts & { applied: boolean }> {
  const first = await redis.hSetNX(K.voters(cellId), userId, dir > 0 ? 'u' : 'd');
  if (first === 1) await redis.hIncrBy(K.votes(cellId), dir > 0 ? 'up' : 'down', 1);
  return { ...(await getVotes(cellId)), applied: first === 1 };
}
