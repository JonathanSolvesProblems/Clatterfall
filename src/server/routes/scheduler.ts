import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import { runDaily } from '../core/dailyRun';

export const scheduler = new Hono();

/** The one daily run: re-simulate the whole machine and advance the frontier. */
scheduler.post('/daily-run', async (c) => {
  try {
    const { ran, result } = await runDaily(Date.now());
    if (ran) console.log(`[Clatterfall] daily run: reach=${result?.reach}px state=${result?.state}`);
  } catch (e) {
    console.error('[Clatterfall] daily-run cron failed:', e);
  }
  return c.json<TaskResponse>({}, 200);
});
