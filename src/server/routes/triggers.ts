import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import { openMachine, seedStarterMachine } from '../core/seed';
import { initGame, loadMachine } from '../redis/schema';

export const triggers = new Hono();

/** On install: initialise game state, seed a real starter machine, post it. */
triggers.post('/on-app-install', async (c) => {
  try {
    const now = Date.now();
    await initGame(now);
    const { cells } = await loadMachine();
    if (cells.length === 0) await seedStarterMachine(now);
    // Run it once, so the post opens on a marble threading the machine rather than
    // a static board with a depth of 0. Idempotent if a run already exists.
    await openMachine(now);
    const post = await createPost();
    return c.json<TriggerResponse>(
      { status: 'success', message: `Clatterfall installed in r/${context.subredditName}, post ${post.id}` },
      200
    );
  } catch (error) {
    console.error(`[Clatterfall] install failed: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'install failed' }, 400);
  }
});

/** On upgrade: make sure game state exists (idempotent). */
triggers.post('/on-app-upgrade', async (c) => {
  try {
    await initGame(Date.now());
    return c.json<TriggerResponse>({ status: 'success', message: 'upgraded' }, 200);
  } catch (error) {
    console.error(`[Clatterfall] upgrade failed: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'upgrade failed' }, 400);
  }
});
