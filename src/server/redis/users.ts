/** Per-user records: streaks, lifetime stats, and the auto-play watch marker. */
import { redis } from '@devvit/web/server';
import { K, dateStr } from './schema';

export type UserRecord = {
  streak: number;
  longestStreak: number;
  lifetimePx: number;
  bestPartPx: number;
  partsPlaced: number;
  lastPlacedDay: string;
  lastWatchedRunDate: string;
};

function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return dateStr(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - 86_400_000);
}

export async function getUser(id: string): Promise<UserRecord> {
  const h = await redis.hGetAll(K.user(id));
  return {
    streak: Number(h.streak ?? '0'),
    longestStreak: Number(h.longestStreak ?? '0'),
    lifetimePx: Number(h.lifetimePx ?? '0'),
    bestPartPx: Number(h.bestPartPx ?? '0'),
    partsPlaced: Number(h.partsPlaced ?? '0'),
    lastPlacedDay: h.lastPlacedDay ?? '',
    lastWatchedRunDate: h.lastWatchedRunDate ?? '',
  };
}

/** Record a placement and roll the streak. Returns the new streak length. */
export async function recordPlacement(id: string, date: string): Promise<number> {
  const u = await getUser(id);
  let streak: number;
  if (u.lastPlacedDay === date) streak = u.streak || 1;
  else if (u.lastPlacedDay === prevDay(date)) streak = u.streak + 1;
  else streak = 1;
  const longestStreak = Math.max(u.longestStreak, streak);
  await redis.hSet(K.user(id), {
    streak: String(streak),
    longestStreak: String(longestStreak),
    partsPlaced: String(u.partsPlaced + 1),
    lastPlacedDay: date,
  });
  return streak;
}

export async function markWatched(id: string, runDate: string): Promise<void> {
  await redis.hSet(K.user(id), { lastWatchedRunDate: runDate });
}

/** Fold one run's contribution into a user's lifetime totals. */
export async function applyRunStats(id: string, addPx: number, bestSinglePx: number): Promise<void> {
  const u = await getUser(id);
  await redis.hSet(K.user(id), {
    lifetimePx: String(u.lifetimePx + Math.max(0, addPx)),
    bestPartPx: String(Math.max(u.bestPartPx, bestSinglePx)),
  });
}
