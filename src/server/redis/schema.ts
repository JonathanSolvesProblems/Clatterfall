/**
 * Typed Redis accessors for Clatterfall. Devvit's redis client exposes only
 * strings, hashes, and sorted sets (no SADD/SISMEMBER), so every "set" and
 * every atomic lock here is a HASH with hSetNX (which returns 1 on first claim,
 * 0 if the field already exists), giving us true atomic cell-claims, one
 * part-per-user-per-day locks, and idempotent cron run-locks.
 */
import { redis } from '@devvit/web/server';
import type { Cell, RunResult } from '../../shared/types';
import { isPartId } from '../../shared/parts';
import { seasonGoalPx } from '../../shared/geometry';
import { DEFAULT_RUN_HOUR_UTC } from '../../shared/constants';

export const K = {
  cells: 'mach:cells',
  deepest: 'mach:deepest',
  frontier: 'mach:frontier:current',
  run: (date: string) => `run:${date}`,
  runLatest: 'run:latest',
  runLocks: 'meta:runlocks',
  runSeq: 'meta:runseq', // monotonic id source for forced/demo runs
  pending: 'meta:pending', // parts placed since the last run (quiet detection)
  userDays: (date: string) => `ud:${date}`, // field userId -> cellId (atomic day lock)
  user: (id: string) => `user:${id}`,
  votes: (cellId: string) => `votes:${cellId}`,
  voters: (cellId: string) => `voters:${cellId}`, // field userId -> dir (one vote/user/cell)
  seasonRecord: (n: number) => `season:${n}:record`,
  season: 'game:season',
  seasonStart: 'game:seasonStart',
  cfgRunHour: 'cfg:runHour',
} as const;

const TTL_2D = 48 * 60 * 60;

// ---- Time helpers (server runs in a normal Node runtime; Date is fine) -------

export function dateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextRunAtMs(nowMs: number, hourUTC: number): number {
  const d = new Date(nowMs);
  const run = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUTC, 0, 0, 0);
  return run > nowMs ? run : run + 86_400_000;
}

export function dayOfSeason(seasonStartMs: number, nowMs: number): number {
  return Math.floor((nowMs - seasonStartMs) / 86_400_000) + 1;
}

// ---- Cell (de)serialization -------------------------------------------------

export function serializeCell(cell: Cell): string {
  return `${cell.part}|${cell.orient}|${cell.owner}|${cell.placedAt}`;
}

function parseCellField(field: string, value: string): Cell | null {
  const colon = field.indexOf(':');
  if (colon < 0) return null;
  const c = Number(field.slice(0, colon));
  const r = Number(field.slice(colon + 1));
  const [part, orient, owner, placedAt] = value.split('|');
  if (part === undefined || orient === undefined || !isPartId(part)) return null;
  return {
    c,
    r,
    part,
    orient,
    owner: owner ?? 'unknown',
    placedAt: Number(placedAt ?? 0),
  };
}

// ---- Game / season state ----------------------------------------------------

export async function initGame(nowMs: number): Promise<void> {
  const season = await redis.get(K.season);
  if (season === undefined) {
    await redis.set(K.season, '1');
    await redis.set(K.seasonStart, String(nowMs));
    await redis.set(K.seasonRecord(1), '0');
    await redis.set(K.deepest, '0');
    await redis.set(K.cfgRunHour, String(DEFAULT_RUN_HOUR_UTC));
  }
}

export async function getRunHour(): Promise<number> {
  const raw = await redis.get(K.cfgRunHour);
  const n = raw === undefined ? DEFAULT_RUN_HOUR_UTC : Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_RUN_HOUR_UTC;
}

export type SeasonState = {
  season: number;
  seasonStart: number;
  record: number;
  goal: number;
};

export async function getSeasonState(): Promise<SeasonState> {
  const [seasonRaw, startRaw] = await Promise.all([redis.get(K.season), redis.get(K.seasonStart)]);
  const season = Number(seasonRaw ?? '1') || 1;
  const seasonStart = Number(startRaw ?? '0');
  const recordRaw = await redis.get(K.seasonRecord(season));
  return {
    season,
    seasonStart,
    record: Number(recordRaw ?? '0'),
    goal: seasonGoalPx(season),
  };
}

export async function setRecord(season: number, px: number): Promise<void> {
  await redis.set(K.seasonRecord(season), String(px));
}

export async function advanceSeason(nowMs: number): Promise<number> {
  const cur = Number((await redis.get(K.season)) ?? '1') || 1;
  const next = cur + 1;
  await redis.set(K.season, String(next));
  await redis.set(K.seasonStart, String(nowMs));
  await redis.set(K.seasonRecord(next), '0');
  return next;
}

// ---- Machine ----------------------------------------------------------------

export async function loadMachine(): Promise<{ cells: Cell[]; deepestRow: number }> {
  const raw = await redis.hGetAll(K.cells);
  const cells: Cell[] = [];
  let deepestRow = 0;
  for (const [field, value] of Object.entries(raw)) {
    const cell = parseCellField(field, value);
    if (cell) {
      cells.push(cell);
      if (cell.r > deepestRow) deepestRow = cell.r;
    }
  }
  return { cells, deepestRow };
}

export async function getDeepestRow(): Promise<number> {
  return Number((await redis.get(K.deepest)) ?? '0');
}

export async function setDeepestRow(row: number): Promise<void> {
  await redis.set(K.deepest, String(row));
}

/** Atomic first-commit-wins cell claim. Returns true if this caller won it. */
export async function claimCell(cellId: string, cell: Cell): Promise<boolean> {
  const got = await redis.hSetNX(K.cells, cellId, serializeCell(cell));
  return got === 1;
}

export async function releaseCell(cellId: string): Promise<void> {
  await redis.hDel(K.cells, [cellId]);
}

export async function removeCells(cellIds: string[]): Promise<void> {
  if (cellIds.length) await redis.hDel(K.cells, cellIds);
}

export async function cellExists(cellId: string): Promise<boolean> {
  return (await redis.hGet(K.cells, cellId)) !== undefined;
}

/** Wipe the machine (cells, frontier, pending, deepest) for a clean reseed. */
export async function resetMachine(): Promise<void> {
  await redis.del(K.cells);
  await redis.del(K.frontier);
  await redis.set(K.pending, '0');
  await redis.set(K.deepest, '0');
}

// ---- One-part-per-user-per-day lock ----------------------------------------

/** Atomic day lock. Returns true if this user has NOT yet placed today. */
export async function claimUserDay(date: string, userId: string, cellId: string): Promise<boolean> {
  const got = await redis.hSetNX(K.userDays(date), userId, cellId);
  if (got === 1) {
    await redis.expire(K.userDays(date), TTL_2D);
    return true;
  }
  return false;
}

export async function releaseUserDay(date: string, userId: string): Promise<void> {
  await redis.hDel(K.userDays(date), [userId]);
}

export async function hasPlacedToday(date: string, userId: string): Promise<boolean> {
  const v = await redis.hGet(K.userDays(date), userId);
  return v !== undefined;
}

// ---- Frontier (single "current buildable cells" hash-as-set) ----------------

export async function setFrontier(cellIds: string[]): Promise<void> {
  await redis.del(K.frontier);
  if (cellIds.length) {
    const fields: Record<string, string> = {};
    for (const id of cellIds) fields[id] = '1';
    await redis.hSet(K.frontier, fields);
  }
}

export async function getFrontier(): Promise<string[]> {
  return redis.hKeys(K.frontier);
}

export async function isFrontier(cellId: string): Promise<boolean> {
  const v = await redis.hGet(K.frontier, cellId);
  return v !== undefined;
}

/** Remove a just-claimed cell from the buildable set (until the next run). */
export async function clearFrontierCell(cellId: string): Promise<void> {
  await redis.hDel(K.frontier, [cellId]);
}

// ---- Daily run storage ------------------------------------------------------

export async function claimRunLock(date: string): Promise<boolean> {
  const got = await redis.hSetNX(K.runLocks, date, String(Date.now()));
  return got === 1;
}

/** Release a run lock so a failed daily run can be retried by the next cron. */
export async function releaseRunLock(date: string): Promise<void> {
  await redis.hDel(K.runLocks, [date]);
}

/** Monotonic id for forced/demo runs, so they never collide with the dated cron. */
export async function nextRunSeq(): Promise<number> {
  return redis.incrBy(K.runSeq, 1);
}

const RUN_TTL = 45 * 24 * 60 * 60; // keep replays ~a season, then let them expire

export async function saveRun(run: RunResult): Promise<void> {
  await redis.set(K.run(run.date), JSON.stringify(run));
  await redis.expire(K.run(run.date), RUN_TTL);
  await redis.set(K.runLatest, run.date);
}

export async function getLatestRunDate(): Promise<string | null> {
  return (await redis.get(K.runLatest)) ?? null;
}

export async function getRun(date: string): Promise<RunResult | null> {
  const raw = await redis.get(K.run(date));
  return raw ? (JSON.parse(raw) as RunResult) : null;
}

// ---- Pending placements (quiet-day detection) -------------------------------

export async function incrPending(): Promise<void> {
  await redis.incrBy(K.pending, 1);
}

export async function readAndResetPending(): Promise<number> {
  const n = Number((await redis.get(K.pending)) ?? '0');
  await redis.set(K.pending, '0');
  return n;
}
