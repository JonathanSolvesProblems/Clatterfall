import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { ErrorResponse, PlaceRequest, RunResponse, VoteRequest } from '../../shared/api';
import type { CliffhangerState } from '../../shared/types';
import { buildState } from '../core/state';
import { topContributors } from '../core/contributors';
import { isModerator } from '../core/mod';
import { placePart } from '../core/place';
import { castVote } from '../redis/votes';
import { simulate } from '../sim/engine';
import { cellId } from '../../shared/geometry';
import { TIE_EPS_PX } from '../../shared/constants';
import { cellExists, dayOfSeason, getLatestRunDate, getRun, getSeasonState, incrDissolved, loadMachine, removeCells } from '../redis/schema';
import { markWatched } from '../redis/users';

export const api = new Hono();

async function currentUser(): Promise<string | null> {
  try {
    return (await reddit.getCurrentUsername()) ?? null;
  } catch {
    return null;
  }
}

api.get('/state', async (c) => {
  const { postId } = context;
  if (!postId) return c.json<ErrorResponse>({ status: 'error', message: 'missing postId' }, 400);
  const name = await currentUser();
  const user = name ?? 'anonymous';
  const state = await buildState(postId, user, user);
  return c.json({ ...state, isMod: await isModerator(name) });
});

api.get('/run/:date', async (c) => {
  const dateParam = c.req.param('date');
  const date = dateParam === 'latest' ? await getLatestRunDate() : dateParam;
  if (!date) return c.json<ErrorResponse>({ status: 'error', message: 'no run yet' }, 404);
  const run = await getRun(date);
  if (!run) return c.json<ErrorResponse>({ status: 'error', message: 'run not found' }, 404);

  const machine = await loadMachine();

  // Draw the machine AS IT WAS when this run was simulated. Parts placed since are
  // pending: they were not in the simulation, so if we drew them the marble would
  // visibly pass straight through them and the replay would look broken.
  const asRun = run.at ? machine.cells.filter((m) => m.placedAt <= run.at) : machine.cells;

  const payload: RunResponse = {
    type: 'run',
    date: run.date,
    season: run.season,
    day: run.day,
    keyframes: run.keyframes,
    events: run.events,
    reach: run.reach,
    prevRecord: run.prevRecord,
    record: run.record,
    goal: run.goal,
    state: run.state,
    quiet: run.quiet,
    contributions: run.contributions,
    cappingCell: run.cappingCell,
    // Runs saved before this field existed have no leaderboard; recompute it.
    topContributors: run.topContributors ?? topContributors(asRun, run.contributions),
    dissolved: run.dissolved ?? 0,
    jammedOwner: run.jammedOwner ?? '',
    cells: asRun.map((m) => ({ c: m.c, r: m.r, part: m.part, orient: m.orient, owner: m.owner })),
  };
  return c.json(payload);
});

/** A non-scoring preview: run the machine as it stands right now (incl. today's
 *  pending parts) so a player/judge sees the effect of their part immediately. */
api.get('/preview', async (c) => {
  const machine = await loadMachine();
  const season = await getSeasonState();
  const sim = simulate(machine.cells, machine.deepestRow);
  const reach = sim.reach;
  const record = season.record;
  const goal = season.goal;
  const state: CliffhangerState =
    reach >= goal ? 'goal' : reach > record ? 'record' : Math.abs(reach - record) <= TIE_EPS_PX ? 'tied' : 'capped';
  const payload: RunResponse = {
    type: 'run',
    date: 'preview',
    season: season.season,
    // The real day, not 0. A preview is still happening "today".
    day: dayOfSeason(season.seasonStart, Date.now()),
    keyframes: sim.keyframes,
    events: sim.events,
    reach,
    prevRecord: record,
    // A preview NEVER changes the record, so never report one. Reporting
    // max(record, reach) made the HUD claim a record the community had not
    // actually set, which is a lie the moment anyone compares it to the board.
    record,
    goal,
    state,
    quiet: false,
    contributions: sim.contributions,
    cappingCell: state === 'capped' ? sim.cappingCell : '',
    topContributors: topContributors(machine.cells, sim.contributions),
    dissolved: 0, // a preview never dissolves anything: it does not mutate the machine
    jammedOwner: '', // nor does it clear a jam
    cells: machine.cells.map((m) => ({ c: m.c, r: m.r, part: m.part, orient: m.orient, owner: m.owner })),
  };
  return c.json(payload);
});

api.post('/place', async (c) => {
  const user = await currentUser();
  if (!user) return c.json({ ok: false, reason: 'no_user', message: 'Log in to place a part' }, 200);
  const body = await c.req.json<PlaceRequest>().catch(() => null);
  if (!body) return c.json({ ok: false, reason: 'invalid', message: 'Bad request' }, 200);
  const res = await placePart(user, body);
  return c.json(res);
});

api.post('/vote', async (c) => {
  const user = await currentUser();
  if (!user) return c.json({ ok: false, up: 0, down: 0 }, 200);
  const body = await c.req.json<VoteRequest>().catch(() => null);
  if (!body || (body.dir !== 1 && body.dir !== -1)) return c.json({ ok: false, up: 0, down: 0 }, 200);
  const id = cellId(body.c, body.r);
  if (!(await cellExists(id))) return c.json({ ok: false, up: 0, down: 0 }, 200);
  const counts = await castVote(id, body.dir, user);
  return c.json({ ok: true, up: counts.up, down: counts.down, applied: counts.applied });
});

/** Mod tool: pull a single griefing part without reseeding the whole machine.
 *  Mod status is re-checked here, never taken from the client. */
api.post('/remove', async (c) => {
  const user = await currentUser();
  if (!user) return c.json({ ok: false, message: 'Log in' }, 200);
  if (!(await isModerator(user))) return c.json({ ok: false, message: 'Moderators only' }, 200);

  const body = await c.req.json<{ c: number; r: number }>().catch(() => null);
  if (!body || typeof body.c !== 'number' || typeof body.r !== 'number') {
    return c.json({ ok: false, message: 'Bad request' }, 200);
  }
  const id = cellId(body.c, body.r);
  if (!(await cellExists(id))) return c.json({ ok: false, message: 'No part there' }, 200);

  await removeCells([id]);
  // A mod pull is a dissolve as far as the ledger is concerned. Without this the
  // invariant `placed - dissolved === standing` breaks permanently, and the survival
  // number on the feed card overstates the machine from then on.
  await incrDissolved(1);
  return c.json({ ok: true, message: 'Part removed' });
});

api.post('/watched', async (c) => {
  const user = await currentUser();
  const body = await c.req.json<{ date: string }>().catch(() => null);
  if (user && body?.date) await markWatched(user, body.date);
  return c.json({ ok: true });
});
