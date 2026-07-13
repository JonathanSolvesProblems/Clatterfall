/** Assembles the GET /api/state snapshot the client renders and plays from. */
import type { StateResponse, UserPanel, WireCell } from '../../shared/api';
import { cellId } from '../../shared/geometry';
import { getUser } from '../redis/users';
import { simulate } from '../sim/engine';
import { computeAndStoreFrontier } from './frontier';
import {
  dateStr,
  dayOfSeason,
  getFrontier,
  getLatestRunDate,
  getRun,
  getRunHour,
  getSeasonState,
  hasPlacedToday,
  loadMachine,
  nextRunAtMs,
} from '../redis/schema';

export async function buildState(
  postId: string,
  userId: string,
  username: string
): Promise<StateResponse> {
  const now = Date.now();
  const [machine, season, latestRunDate, frontier, runHour, user] = await Promise.all([
    loadMachine(),
    getSeasonState(),
    getLatestRunDate(),
    getFrontier(),
    getRunHour(),
    getUser(userId),
  ]);

  const cells: WireCell[] = machine.cells.map((c) => ({
    c: c.c,
    r: c.r,
    part: c.part,
    orient: c.orient,
    owner: c.owner,
  }));

  // Safety net: if a machine exists but somehow has no frontier (e.g. an install
  // predating the seed-frontier fix), compute one now so the board is playable.
  let frontierCells = frontier;
  if (frontierCells.length === 0 && machine.cells.length > 0) {
    const sim = simulate(machine.cells, machine.deepestRow);
    frontierCells = await computeAndStoreFrontier(sim.escape, machine.cells);
  }

  const latestRun = latestRunDate ? await getRun(latestRunDate) : null;
  const date = dateStr(now);
  const builders = new Set(machine.cells.map((c) => c.owner).filter((o) => o && o !== 'clatterfall')).size;

  const userPanel: UserPanel = {
    username,
    placedToday: await hasPlacedToday(date, userId),
    streak: user.streak,
    longestStreak: user.longestStreak,
    lifetimePx: user.lifetimePx,
    bestPartPx: user.bestPartPx,
    yourCells: machine.cells.filter((c) => c.owner === userId).map((c) => cellId(c.c, c.r)),
  };

  return {
    type: 'state',
    postId,
    season: season.season,
    day: dayOfSeason(season.seasonStart, now),
    cells,
    frontier: frontierCells,
    deepestRow: machine.deepestRow,
    reach: latestRun?.reach ?? 0,
    record: season.record,
    goal: season.goal,
    latestRunDate,
    hasNewRunForUser: !!latestRunDate && user.lastWatchedRunDate !== latestRunDate,
    nextRunAtMs: nextRunAtMs(now, runHour),
    serverNowMs: now,
    builders,
    lastContributions: latestRun?.contributions ?? {},
    lastPath: (latestRun?.keyframes ?? []).filter((_, i) => i % 2 === 0).map((k) => ({ x: k.x, y: k.y })),
    user: userPanel,
  };
}
