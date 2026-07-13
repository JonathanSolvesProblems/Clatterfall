import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import { seedStarterMachine } from '../core/seed';
import { runDaily } from '../core/dailyRun';
import { getSeasonState, initGame, loadMachine, resetMachine, setRecord } from '../redis/schema';

export const menu = new Hono();

/** Moderator: create a new interactive post for this subreddit's machine. */
menu.post('/post-create', async (c) => {
  try {
    const now = Date.now();
    await initGame(now);
    const { cells } = await loadMachine();
    if (cells.length === 0) await seedStarterMachine(now);
    const post = await createPost();
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200
    );
  } catch (error) {
    console.error(`[Clatterfall] post-create failed: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

/** Moderator: force a run now (demo/testing without waiting for the cron). */
menu.post('/run-now', async (c) => {
  try {
    const { ran, result } = await runDaily(Date.now(), { force: true });
    return c.json<UiResponse>(
      { showToast: ran ? `The marble ran, reached ${result?.reach ?? 0}px` : 'Already ran today' },
      200
    );
  } catch (error) {
    console.error(`[Clatterfall] run-now failed: ${error}`);
    return c.json<UiResponse>({ showToast: 'Run failed' }, 400);
  }
});

/** Moderator: reset the machine and (re)seed a fresh starter cascade. */
menu.post('/reseed', async (c) => {
  try {
    await resetMachine();
    const season = await getSeasonState();
    await setRecord(season.season, 0);
    const n = await seedStarterMachine(Date.now());
    return c.json<UiResponse>({ showToast: `Reset and seeded a ${n}-part starter machine` }, 200);
  } catch (error) {
    console.error(`[Clatterfall] reseed failed: ${error}`);
    return c.json<UiResponse>({ showToast: 'Seed failed' }, 400);
  }
});
