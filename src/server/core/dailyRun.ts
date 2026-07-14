/**
 * The daily run: the retention engine's server half. Ordered pipeline (harden):
 *   run-lock -> decay (using last run's contacts) -> sim -> frontier ->
 *   record/goal/season resolution -> write run. Every write is idempotent, so a
 *   cron double-fire is a no-op; run:<date> is written last as the completion
 *   sentinel.
 */
import type { CliffhangerState, Contributor, RunResult } from '../../shared/types';
import { topContributors } from './contributors';
import { cellId } from '../../shared/geometry';
import { SEASON_DAY_CAP, TIE_EPS_PX } from '../../shared/constants';
import { simulate } from '../sim/engine';
import { evaluateDecay } from './decay';
import { computeAndStoreFrontier } from './frontier';
import { applyRunStats } from '../redis/users';
import {
  advanceSeason,
  claimRunLock,
  dateStr,
  dayOfSeason,
  getLatestRunDate,
  getRun,
  getSeasonState,
  incrDissolved,
  loadMachine,
  nextRunSeq,
  readAndResetPending,
  releaseRunLock,
  removeCells,
  saveRun,
  setDeepestRow,
  setRecord,
} from '../redis/schema';

const HOUSE = 'clatterfall';

export async function runDaily(
  nowMs: number,
  opts?: { force?: boolean }
): Promise<{ ran: boolean; result?: RunResult }> {
  // Cron runs are keyed by (locked) UTC date; forced/demo runs get a monotonic
  // id so repeated "Run now" clicks and a later same-day cron never collide.
  let date: string;
  if (opts?.force) {
    date = `f${await nextRunSeq()}`;
  } else {
    date = dateStr(nowMs);
    if (!(await claimRunLock(date))) return { ran: false };
  }

  try {
    return await execRun(date, nowMs);
  } catch (e) {
    if (!opts?.force) await releaseRunLock(date); // let the next cron retry a failed day
    throw e;
  }
}

async function execRun(date: string, nowMs: number): Promise<{ ran: boolean; result: RunResult }> {
  const prevRunDate = await getLatestRunDate();
  const firstRun = prevRunDate === null;

  // Load the machine.
  let { cells } = await loadMachine();

  // Decay uses the PREVIOUS run's contact set, so a load-bearing part is safe.
  const lastTouched = new Set<string>();
  if (prevRunDate) {
    const prev = await getRun(prevRunDate);
    if (prev) for (const e of prev.events) lastTouched.add(e.cell);
  }
  const removed = await evaluateDecay(cells, lastTouched, nowMs);
  if (removed.length) {
    const rm = new Set(removed);
    cells = cells.filter((c) => !rm.has(cellId(c.c, c.r)));
  }
  const dissolved = removed.length;
  const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
  await setDeepestRow(deepest);

  // Quiet day = a run with no new parts since the last one.
  const pending = await readAndResetPending();
  const quiet = !firstRun && pending === 0;

  // Authoritative single simulation.
  const sim = simulate(cells, deepest);

  // SELF-HEAL: if Pip came to rest ON a part instead of reaching the catch floor,
  // that part is a jam. It would cap the machine forever and, because it is
  // contacted every single run, neither decay path could ever remove it. So the
  // run dissolves it. Players still watch today's jam (it is the cliffhanger),
  // and tomorrow the machine runs clear. This is what makes "a bad part can only
  // cap distance, never brick the machine" actually true.
  // A JAM is not an abandonment. The marble was touching this part, that was the
  // problem. Keeping the two separate matters: the result card tells the player what
  // actually happened to their part, and "the marble abandoned it" is the opposite
  // of the truth here.
  let jammedOwner = '';
  if (sim.stuckOn) {
    const stuck = cells.find((c) => cellId(c.c, c.r) === sim.stuckOn);
    jammedOwner = stuck?.owner ?? '';
    await removeCells([sim.stuckOn]);
    cells = cells.filter((c) => cellId(c.c, c.r) !== sim.stuckOn);
    await setDeepestRow(cells.reduce((m, c) => Math.max(m, c.r), 0));
    console.log(`[Clatterfall] cleared jamming part at ${sim.stuckOn} (${jammedOwner})`);
  }
  // Both leave the machine, so both count against the ledger.
  await incrDissolved(dissolved + (sim.stuckOn ? 1 : 0));

  // Advance the frontier for the next building day.
  await computeAndStoreFrontier(sim.escape, cells, sim.fallPath);

  // Scoring & cliffhanger resolution.
  const season = await getSeasonState();
  const prevRecord = season.record;
  const goal = season.goal;
  const reach = sim.reach;

  /**
   * A jammed run never sets a record.
   *
   * On a jam, the marble comes to rest ON a part, and that part is then cleared so
   * tomorrow's machine can run free. If the depth it reached while stuck counted as a
   * record, the community would be left chasing a number produced by a part that no
   * longer exists, on a machine that can no longer reach it. The run did not complete;
   * it does not score.
   */
  const jammed = sim.stuckOn !== '';
  let record = prevRecord;
  if (!jammed && reach > prevRecord) {
    record = reach;
    await setRecord(season.season, reach);
  }

  let state: CliffhangerState;
  if (quiet) state = 'quiet';
  else if (jammed) state = 'jammed';
  else if (firstRun) state = 'firstday';
  else if (reach >= goal) state = 'goal';
  else if (reach > prevRecord) state = 'record';
  else if (Math.abs(reach - prevRecord) <= TIE_EPS_PX) state = 'tied';
  else state = 'capped';

  // Fold contributions into each contributor's lifetime totals.
  const ownerByCell = new Map(cells.map((c) => [cellId(c.c, c.r), c.owner]));
  const ownerSum = new Map<string, number>();
  const ownerBest = new Map<string, number>();
  for (const [cid, px] of Object.entries(sim.contributions)) {
    if (!cid) continue;
    const owner = ownerByCell.get(cid);
    if (!owner || owner === HOUSE) continue;
    ownerSum.set(owner, (ownerSum.get(owner) ?? 0) + px);
    ownerBest.set(owner, Math.max(ownerBest.get(owner) ?? 0, px));
  }
  for (const [owner, sum] of ownerSum) {
    await applyRunStats(owner, sum, ownerBest.get(owner) ?? 0);
  }

  const leaders: Contributor[] = topContributors(cells, sim.contributions);

  const day = dayOfSeason(season.seasonStart, nowMs);
  const result: RunResult = {
    date,
    at: nowMs,
    season: season.season,
    day,
    keyframes: sim.keyframes,
    events: sim.events,
    reach,
    prevRecord,
    record,
    goal,
    state,
    quiet,
    escape: sim.escape,
    contributions: sim.contributions,
    cappingCell: state === 'capped' ? sim.cappingCell : '',
    topContributors: leaders,
    dissolved,
    jammedOwner,
  };
  await saveRun(result); // completion sentinel, written last

  // Roll the season on a goal, or when the day cap is hit with the goal unmet.
  if (state === 'goal' || day >= SEASON_DAY_CAP) await advanceSeason(nowMs);

  return { ran: true, result };
}
