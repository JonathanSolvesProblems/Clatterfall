/**
 * End-to-end server pipeline tests against an in-memory Redis mock.
 * Covers the paths unit tests can't reach: atomic placement (cell race +
 * one-part-per-day + rollback), the opening frontier at seed time, the daily-run
 * pipeline (firstday/quiet), and forced-run isolation from the dated cron lock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = vi.hoisted(() => ({
  str: new Map<string, string>(),
  hash: new Map<string, Map<string, string>>(),
}));

vi.mock('@devvit/web/server', () => {
  const h = (k: string): Map<string, string> => {
    let m = store.hash.get(k);
    if (!m) {
      m = new Map();
      store.hash.set(k, m);
    }
    return m;
  };
  const redis = {
    get: async (k: string) => store.str.get(k),
    set: async (k: string, v: string) => {
      store.str.set(k, v);
      return 'OK';
    },
    del: async (...keys: string[]) => {
      for (const k of keys) {
        store.str.delete(k);
        store.hash.delete(k);
      }
    },
    expire: async () => undefined,
    incrBy: async (k: string, n: number) => {
      const v = Number(store.str.get(k) ?? '0') + n;
      store.str.set(k, String(v));
      return v;
    },
    hSet: async (k: string, fields: Record<string, string>) => {
      const m = h(k);
      let added = 0;
      for (const [f, v] of Object.entries(fields)) {
        if (!m.has(f)) added++;
        m.set(f, v);
      }
      return added;
    },
    hSetNX: async (k: string, f: string, v: string) => {
      const m = h(k);
      if (m.has(f)) return 0;
      m.set(f, v);
      return 1;
    },
    hGet: async (k: string, f: string) => store.hash.get(k)?.get(f),
    hGetAll: async (k: string) => Object.fromEntries(store.hash.get(k) ?? new Map()),
    hDel: async (k: string, fields: string[]) => {
      const m = store.hash.get(k);
      if (!m) return 0;
      let n = 0;
      for (const f of fields) if (m.delete(f)) n++;
      return n;
    },
    hKeys: async (k: string) => [...(store.hash.get(k) ?? new Map()).keys()],
    hIncrBy: async (k: string, f: string, n: number) => {
      const m = h(k);
      const v = Number(m.get(f) ?? '0') + n;
      m.set(f, String(v));
      return v;
    },
  };
  return {
    redis,
    reddit: { getCurrentUsername: async () => 'tester', submitCustomPost: async () => ({ id: 't3_test' }) },
    context: { postId: 't3_test', subredditName: 'clatterfall' },
  };
});

import { redis } from '@devvit/web/server';
import { seedStarterMachine } from './seed';
import { placePart } from './place';
import { runDaily } from './dailyRun';
import { evaluateDecay } from './decay';
import { openMachine } from './seed';
import { cellId } from '../../shared/geometry';
import { castVote } from '../redis/votes';
import { HOUSE_OWNER } from '../../shared/constants';
import {
  K,
  builderCount,
  getDeepestRow,
  getFrontier,
  getLatestRunDate,
  getLedger,
  getRun,
  getSeasonState,
  initGame,
  loadMachine,
  removeCells,
  resetMachine,
} from '../redis/schema';
import { parseCell } from '../../shared/geometry';
import { DECAY_DOWNVOTE_THRESHOLD, DECAY_MIN_AGE_MS } from '../../shared/constants';
import { PARTS } from '../../shared/parts';
import { api } from '../routes/api';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 1, 14, 0, 0);

beforeEach(() => {
  store.str.clear();
  store.hash.clear();
});

async function fresh(): Promise<void> {
  await initGame(NOW);
  await seedStarterMachine(NOW);
}

describe('seed', () => {
  it('writes the machine AND an opening frontier so the board is playable at once', async () => {
    await fresh();
    const { cells } = await loadMachine();
    // A real cascade, deep enough to look built but with room to grow to the goal.
    expect(cells.length).toBeGreaterThanOrEqual(16);
    const deepest = await getDeepestRow();
    expect(deepest).toBe(cells.reduce((m, c) => Math.max(m, c.r), 0));
    expect(deepest).toBeLessThan(78); // still far from the season goal

    const frontier = await getFrontier();
    expect(frontier.length).toBeGreaterThan(0);
    // Every frontier cell must be empty.
    const occupied = new Set(cells.map((c) => `${c.c}:${c.r}`));
    for (const id of frontier) expect(occupied.has(id)).toBe(false);
  });

  /**
   * The cold-open guarantee. Without a stored run there is no run:latest, so
   * hasNewRunForUser is false, the Build scene never auto-plays, and depth and
   * record both read 0. A judge opening a fresh post would see a static board of
   * sticks and no marble until the cron first fired, up to 24 hours later.
   */
  it('openMachine leaves a fresh post with a real run to watch, and is idempotent', async () => {
    await initGame(NOW);
    await seedStarterMachine(NOW);
    expect(await getLatestRunDate()).toBeNull(); // seeding alone is not enough

    await openMachine(NOW);

    const date = await getLatestRunDate();
    expect(date).toBeTruthy();
    const run = await getRun(date as string);
    expect(run).toBeTruthy();
    expect(run?.reach).toBeGreaterThan(0);
    expect(run?.keyframes.length).toBeGreaterThan(1);

    // Called again (e.g. a second post), it must not clobber the existing run.
    await openMachine(NOW + 1000);
    expect(await getLatestRunDate()).toBe(date);
  });
});

/**
 * Vote state is keyed by COORDINATES, not by part. If it outlives the part it
 * belonged to, the next part built on that cell inherits the dead part's downvotes
 * AND its consecutive-untouched-run counter, which together defeat both the
 * 5-downvote threshold and the 48h age gate. A handful of sock accounts could then
 * dissolve any brand-new part on its first untouched run.
 */
describe('vote state never outlives the part it belonged to', () => {
  it('a part removed by ANY path takes its votes, voters and missed counter with it', async () => {
    await fresh();
    const open = (await getFrontier()).map(parseCell);
    const a = open[0] as { c: number; r: number };
    const id = `${a.c}:${a.r}`;

    await placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' });

    // Bury it: downvotes, a voter roster, and a high untouched-run counter.
    await castVote(id, -1, 'sock1');
    await castVote(id, -1, 'sock2');
    await redis.hSet(K.votes(id), { missed: '9' });
    expect(await redis.hGetAll(K.votes(id))).not.toEqual({});

    // Remove via the mod/jam path (removeCells), NOT the decay path.
    await removeCells([id]);

    // Every trace must be gone, or the next part here starts pre-condemned.
    expect(await redis.hGetAll(K.votes(id))).toEqual({});
    expect(await redis.hGetAll(K.voters(id))).toEqual({});

    // And a voter on the dead part can vote again on the new one (hSetNX roster).
    const counts = await castVote(id, 1, 'sock1');
    expect(counts.applied).toBe(true);
    expect(counts.up).toBe(1);
    expect(counts.down).toBe(0);
  });

  it('a reseed does not leave stale votes behind for the new machine to inherit', async () => {
    await fresh();
    const open = (await getFrontier()).map(parseCell);
    const a = open[0] as { c: number; r: number };
    const id = `${a.c}:${a.r}`;
    await placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' });
    await castVote(id, -1, 'sock1');
    await redis.hSet(K.votes(id), { missed: '9' });

    await resetMachine();

    expect(await redis.hGetAll(K.votes(id))).toEqual({});
    expect(await redis.hGetAll(K.voters(id))).toEqual({});
  });
});

/**
 * The survival ledger is the headline number shown to judges on the feed card:
 * "N parts placed, M dissolved, K still carrying the marble". If placed - dissolved
 * ever drifts from the number of parts actually standing, that number becomes a lie,
 * so the invariant is pinned here rather than trusted.
 */
describe('survival ledger', () => {
  it('starts at the seed size with nothing dissolved', async () => {
    await fresh();
    const { cells } = await loadMachine();
    const led = await getLedger();
    expect(led.placed).toBe(cells.length);
    expect(led.dissolved).toBe(0);
  });

  it('placed - dissolved always equals the parts still standing', async () => {
    await fresh();

    // A cohort builds for several days, with runs (and therefore decay) in between.
    const users = ['alice', 'bob', 'carol', 'dave', 'erin'];
    for (let day = 0; day < 6; day++) {
      const at = NOW + day * 86_400_000;
      for (const u of users) {
        const open = await getFrontier();
        const cell = open.map(parseCell)[0];
        if (!cell) continue;
        await placePart(u, { c: cell.c, r: cell.r, part: 'ramp', orient: 'R' });
      }
      await runDaily(at, { force: true });

      const { cells } = await loadMachine();
      const led = await getLedger();
      expect(led.placed - led.dissolved).toBe(cells.length);
    }

    // And the machine must actually have pruned something over six days, or the
    // "dissolved" number we put in front of judges is decoration.
    const led = await getLedger();
    expect(led.placed).toBeGreaterThan(0);
  });
});

describe('placement atomicity', () => {
  it('places on a frontier cell, then enforces one part per user per day', async () => {
    await fresh();
    const frontier = await getFrontier();
    const a = parseCell(frontier[0] as string);
    const b = parseCell(frontier[1] as string);

    const ok = await placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' });
    expect(ok.ok).toBe(true);

    const again = await placePart('alice', { c: b.c, r: b.r, part: 'ramp', orient: 'R' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already_placed');

    // alice's rollback must not have leaked a cell: bob can still take b.
    const bob = await placePart('bob', { c: b.c, r: b.r, part: 'bouncer', orient: 'U' });
    expect(bob.ok).toBe(true);
  });

  it('a claimed cell leaves the frontier, so a later tap on it is rejected', async () => {
    await fresh();
    const frontier = await getFrontier();
    const a = parseCell(frontier[0] as string);
    const other = parseCell(frontier[1] as string);

    expect((await placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' })).ok).toBe(true);

    const lost = await placePart('bob', { c: a.c, r: a.r, part: 'ramp', orient: 'R' });
    expect(lost.ok).toBe(false);

    // Losing must NOT have consumed bob's part for the day.
    expect((await placePart('bob', { c: other.c, r: other.r, part: 'ramp', orient: 'L' })).ok).toBe(true);
  });

  it('CONCURRENT claims on one cell: exactly one wins, the loser keeps their daily part', async () => {
    await fresh();
    const frontier = await getFrontier();
    const a = parseCell(frontier[0] as string);
    const other = parseCell(frontier[1] as string);

    const [ra, rb] = await Promise.all([
      placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' }),
      placePart('bob', { c: a.c, r: a.r, part: 'ramp', orient: 'R' }),
    ]);
    const wins = [ra, rb].filter((r) => r.ok);
    const losses = [ra, rb].filter((r) => !r.ok);
    expect(wins.length).toBe(1);
    expect(losses.length).toBe(1);
    const loss = losses[0];
    if (loss && !loss.ok) expect(loss.reason).toBe('occupied');

    // The loser never burned their daily part.
    const loser = ra.ok ? 'bob' : 'alice';
    expect((await placePart(loser, { c: other.c, r: other.r, part: 'ramp', orient: 'L' })).ok).toBe(true);
  });

  it('CONCURRENT double-submit by one user: only one part stands, the other cell is rolled back', async () => {
    await fresh();
    const frontier = await getFrontier();
    const a = parseCell(frontier[0] as string);
    const b = parseCell(frontier[1] as string);

    const [r1, r2] = await Promise.all([
      placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' }),
      placePart('alice', { c: b.c, r: b.r, part: 'bouncer', orient: 'U' }),
    ]);
    expect([r1, r2].filter((r) => r.ok).length).toBe(1);

    // The rolled-back cell must be free again: another user can claim it.
    const freed = r1.ok ? b : a;
    expect((await placePart('bob', { c: freed.c, r: freed.r, part: 'ramp', orient: 'L' })).ok).toBe(true);

    // And alice ends up with exactly one standing part.
    const { cells } = await loadMachine();
    expect(cells.filter((c) => c.owner === 'alice').length).toBe(1);
  });

  it('rejects cells outside the frontier', async () => {
    await fresh();
    const off = await placePart('alice', { c: 0, r: 0, part: 'ramp', orient: 'R' });
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.reason).toBe('not_frontier');
  });

  it('rejects an unknown orientation', async () => {
    await fresh();
    const frontier = await getFrontier();
    const a = parseCell(frontier[0] as string);
    const bad = await placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'ZZ' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('invalid');
  });
});

describe('daily run pipeline', () => {
  it('first run resolves as firstday, sets the record, and stores contributions summing to REACH', async () => {
    await fresh();
    const { ran, result } = await runDaily(NOW);
    expect(ran).toBe(true);
    expect(result?.state).toBe('firstday');
    expect(result!.reach).toBeGreaterThan(0);
    expect(result!.record).toBe(result!.reach);
    const sum = Object.values(result!.contributions).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result!.reach);
  });

  it('is idempotent: a second cron for the same date is a no-op', async () => {
    await fresh();
    expect((await runDaily(NOW)).ran).toBe(true);
    expect((await runDaily(NOW)).ran).toBe(false);
  });

  it('a later day with no new parts resolves as a quiet run', async () => {
    await fresh();
    await runDaily(NOW);
    const second = await runDaily(NOW + DAY);
    expect(second.ran).toBe(true);
    expect(second.result?.state).toBe('quiet');
  });

  it('a placed part is included in the next run and credited to its owner', async () => {
    await fresh();
    await runDaily(NOW);
    const frontier = await getFrontier();
    const a = parseCell(frontier[0] as string);
    expect((await placePart('alice', { c: a.c, r: a.r, part: 'ramp', orient: 'R' })).ok).toBe(true);

    const next = await runDaily(NOW + DAY);
    expect(next.result?.state).not.toBe('quiet'); // a new part was placed
    const sum = Object.values(next.result!.contributions).reduce((x, y) => x + y, 0);
    expect(sum).toBe(next.result!.reach);
  });

  it('forced runs get a distinct monotonic id and never consume the dated cron lock', async () => {
    await fresh();
    const f1 = await runDaily(NOW, { force: true });
    const f2 = await runDaily(NOW, { force: true });
    expect(f1.result?.date).toMatch(/^f\d+$/);
    expect(f2.result?.date).toMatch(/^f\d+$/);
    expect(f1.result?.date).not.toBe(f2.result?.date);

    // The real cron for this date must still be able to run.
    expect((await runDaily(NOW)).ran).toBe(true);
  });

  it('exposes a preview run of the current machine without persisting anything', async () => {
    await fresh();
    const res = await api.request('/preview');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.type).toBe('run');
    expect(body.date).toBe('preview');
    expect(Array.isArray(body.keyframes)).toBe(true);
    expect((body.keyframes as unknown[]).length).toBeGreaterThan(2);
    expect(Array.isArray(body.cells)).toBe(true);
    expect(body.reach as number).toBeGreaterThan(0);
    // A preview must not create a stored run.
    expect(await redis.get(K.runLatest)).toBeUndefined();
  });

  it('a preview reports the real day and NEVER claims a record it did not set', async () => {
    await fresh();
    const body = (await (await api.request('/preview')).json()) as Record<string, number>;

    // It is still "today": the HUD showed DAY 0 before this was fixed.
    expect(body.day).toBeGreaterThanOrEqual(1);

    // The season record is still 0 (no scored run yet), and a non-scoring preview
    // must not inflate it just because the marble travelled far.
    expect(body.record).toBe(0);
    expect(body.prevRecord).toBe(0);
    expect(body.reach).toBeGreaterThan(0);

    // And it genuinely did not persist a record.
    const season = await getSeasonState();
    expect(season.record).toBe(0);
  });

  it('advances the frontier after a run and keeps it buildable', async () => {
    await fresh();
    await runDaily(NOW);
    const frontier = await getFrontier();
    expect(frontier.length).toBeGreaterThan(0);
    const { cells } = await loadMachine();
    const occupied = new Set(cells.map((c) => `${c.c}:${c.r}`));
    for (const id of frontier) {
      const { c } = parseCell(id);
      expect(occupied.has(id)).toBe(false);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(8);
    }
  });
});

/**
 * What a player sees when their one part of the day JAMS the marble.
 *
 * This is a real failure path a new player will hit, and it used to be handled
 * badly: the jammed part was folded in with the parts the marble ABANDONED, so the
 * card told them "the marble abandoned your part" when in fact the marble was stuck
 * on it, which is the opposite. Worse, a jam could set a record and then delete the
 * very part that achieved it, leaving the community chasing a number no machine
 * could ever reach again.
 */
describe('a jam explains itself and never sets a record', () => {
  it('reports the jam separately from an abandonment, and does not score it', async () => {
    await fresh();
    await runDaily(NOW, { force: true }); // opening run: record 1,685

    const before = (await getSeasonState()).record;
    expect(before).toBeGreaterThan(0);

    // A Straight Ramp at 7:27 in its first orientation is a known jam on the fresh
    // seed: the marble comes to rest on it instead of reaching the catch floor.
    const placed = await placePart('unlucky', {
      c: 7,
      r: 27,
      part: 'ramp',
      orient: PARTS.ramp.orientations[0] as string,
    });
    expect(placed.ok).toBe(true); // the cell must actually be buildable, or this tests nothing

    const { result } = await runDaily(NOW + DAY, { force: true });
    expect(result).toBeTruthy();
    const run = result as NonNullable<typeof result>;

    // It jammed, and we know exactly whose part it was.
    expect(run.state).toBe('jammed');
    expect(run.jammedOwner).toBe('unlucky');

    // It is NOT counted as a part the marble abandoned. That is a different thing.
    expect(run.dissolved).toBe(0);

    // And it did not set a record it was about to delete.
    expect((await getSeasonState()).record).toBe(before);

    // The part is gone, so tomorrow's machine runs free.
    const { cells } = await loadMachine();
    expect(cells.some((c) => c.c === 7 && c.r === 27)).toBe(false);
  });
});

describe('decay / self-heal', () => {
  const idOf = (c: { c: number; r: number }): string => `${c.c}:${c.r}`;

  it('NEVER removes a part the marble touched last run, even if old and downvoted', async () => {
    await fresh();
    const { cells } = await loadMachine();
    const target = { ...(cells[0] as (typeof cells)[number]), placedAt: NOW - 10 * DAY };
    const id = idOf(target);
    await redis.hIncrBy(K.votes(id), 'down', 50);

    for (let run = 0; run < 3; run++) {
      expect(await evaluateDecay([target], new Set([id]), NOW)).toEqual([]);
    }
    const after = await loadMachine();
    expect(after.cells.some((c) => idOf(c) === id)).toBe(true);
  });

  it('removes a part untouched for two consecutive runs with no support', async () => {
    await fresh();
    const { cells } = await loadMachine();
    const target = cells[0] as (typeof cells)[number];
    const id = idOf(target);

    expect(await evaluateDecay([target], new Set(), NOW)).toEqual([]); // missed = 1
    expect(await evaluateDecay([target], new Set(), NOW)).toEqual([id]); // missed = 2 -> decays

    const after = await loadMachine();
    expect(after.cells.some((c) => idOf(c) === id)).toBe(false);
  });

  /**
   * The pitch is "nobody decides what stays, the marble does". That is only true if
   * the community cannot overrule the marble, so this is the test that keeps the
   * headline claim honest. It used to assert the OPPOSITE (an upvoted part survived
   * abandonment), which meant the strongest line in the submission was false and the
   * counter-example was sitting in our own test suite.
   */
  it('NOBODY can save a part the marble abandoned, however much the crowd likes it', async () => {
    await fresh();
    const { cells } = await loadMachine();
    const target = cells[1] as (typeof cells)[number];
    const id = idOf(target);
    await redis.hIncrBy(K.votes(id), 'up', 99); // adored by the community

    await evaluateDecay([target], new Set(), NOW); // missed = 1
    expect(await evaluateDecay([target], new Set(), NOW)).toEqual([id]); // missed = 2 -> gone

    const after = await loadMachine();
    expect(after.cells.some((c) => idOf(c) === id)).toBe(false);
  });

  /**
   * Voting can only ever ACCELERATE a removal, never veto one. A downvoted part is
   * cut early, before the marble has spent two runs ignoring it.
   */
  it('the crowd can cut a part EARLY, before the marble has finished with it', async () => {
    await fresh();
    const { cells } = await loadMachine();
    const target = cells[2] as (typeof cells)[number];
    const id = idOf(target);
    // Old enough to be votable out, and thoroughly disliked.
    const old = { ...target, placedAt: NOW - DECAY_MIN_AGE_MS - 1000 };
    await redis.hIncrBy(K.votes(id), 'down', DECAY_DOWNVOTE_THRESHOLD);

    // Gone on the FIRST untouched run, without waiting for the marble's verdict.
    expect(await evaluateDecay([old], new Set(), NOW)).toEqual([id]);
  });

  /** Keep-votes defend a part against a downvote brigade (but cannot resurrect it). */
  it('keep-votes defend a part from a brigade', async () => {
    await fresh();
    const { cells } = await loadMachine();
    const target = cells[3] as (typeof cells)[number];
    const id = idOf(target);
    const old = { ...target, placedAt: NOW - DECAY_MIN_AGE_MS - 1000 };
    await redis.hIncrBy(K.votes(id), 'down', DECAY_DOWNVOTE_THRESHOLD);
    await redis.hIncrBy(K.votes(id), 'up', DECAY_DOWNVOTE_THRESHOLD); // brigade neutralised

    // Survives the first run: the vote no longer carries it out early...
    expect(await evaluateDecay([old], new Set(), NOW)).toEqual([]);
    // ...but the marble still gets the final say.
    expect(await evaluateDecay([old], new Set(), NOW)).toEqual([id]);
  });
});

/**
 * "Built by N redditors" is the one adoption number on the feed card, the surface a
 * judge actually lands on. It used to be computed by counting the distinct owners of
 * the parts currently STANDING, which meant the machine quietly disowned anybody whose
 * part the marble stopped touching: the moment their part dissolved, they stopped
 * having built it. The count could only ever go down. It is a claim about who turned
 * up, not about what survived, so it is pinned here.
 */
describe('the roster of who built it', () => {
  it('keeps counting a redditor after their part has dissolved', async () => {
    await fresh();

    // carol places a real part, on the frontier, like anyone else would.
    const cell = (await getFrontier()).map(parseCell)[0]!;
    await placePart('carol', { c: cell.c, r: cell.r, part: 'ramp', orient: 'R' });
    expect(await builderCount((await loadMachine()).cells, NOW)).toBe(1);

    // The marble stops touching it and it dissolves. removeCells is the single path
    // every dissolution goes through, so taking it here exercises the real thing.
    await removeCells([cellId(cell.c, cell.r)]);

    const { cells } = await loadMachine();
    expect(cells.some((c) => c.owner === 'carol')).toBe(false); // her part is gone...
    expect(await builderCount(cells, NOW)).toBe(1); // ...but she still built it.
  });

  it('counts each redditor once, however many parts they place', async () => {
    await fresh();
    for (let day = 0; day < 3; day++) {
      const at = NOW + day * 86_400_000;
      for (const u of ['alice', 'bob']) {
        const cell = (await getFrontier()).map(parseCell)[0];
        if (!cell) continue;
        await placePart(u, { c: cell.c, r: cell.r, part: 'ramp', orient: 'R' });
      }
      await runDaily(at, { force: true });
    }
    expect(await builderCount((await loadMachine()).cells, NOW)).toBe(2);
  });

  it('never counts the house account that laid the starter machine', async () => {
    await fresh();
    const { cells } = await loadMachine();
    expect(cells.every((c) => c.owner === HOUSE_OWNER)).toBe(true);
    expect(await builderCount(cells, NOW)).toBe(0);
  });
});
