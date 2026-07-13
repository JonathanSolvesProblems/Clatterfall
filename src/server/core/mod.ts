/**
 * Is the current user a moderator of this subreddit?
 *
 * Used to gate the "remove this part" tool. A part is only ever a shape in a cell,
 * so no contribution here can carry harmful content, but a mod still needs a way to
 * pull a single griefing part without nuking the whole machine (which is all that
 * "Reseed" can do).
 *
 * The answer is cached briefly in Redis: this is checked on every board load, and a
 * mod list does not change minute to minute.
 */
import { redis, reddit, context } from '@devvit/web/server';

const TTL_SEC = 300;
const key = (sub: string, user: string): string => `mod:${sub}:${user}`;

export async function isModerator(username: string | null): Promise<boolean> {
  const subredditName = context.subredditName;
  if (!username || !subredditName) return false;

  const cacheKey = key(subredditName, username);
  const cached = await redis.get(cacheKey);
  if (cached === '1') return true;
  if (cached === '0') return false;

  let mod: boolean;
  try {
    const mods = await reddit.getModerators({ subredditName }).all();
    mod = mods.some((m) => m.username.toLowerCase() === username.toLowerCase());
  } catch {
    mod = false; // fail closed: never hand out mod powers on an API hiccup
  }

  await redis.set(cacheKey, mod ? '1' : '0');
  await redis.expire(cacheKey, TTL_SEC);
  return mod;
}
