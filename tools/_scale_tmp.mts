/* TEMP: season-scale measurement using the REAL shipped sim + real decay/frontier rules. */
import { simulate } from '../src/server/sim/engine';
import { starterCells } from '../src/server/core/seed';
import { PARTS, PART_LIST } from '../src/shared/parts';
import { cellId, coneCells, parseCell } from '../src/shared/geometry';
import { DECAY_UNTOUCHED_RUNS, SEASON_DAY_CAP } from '../src/shared/constants';
import type { Cell } from '../src/shared/types';

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; }

function season(seed: number, placersPerDay: number, useDecay: boolean) {
  const rand = rng(seed);
  let cells: Cell[] = [...starterCells(1_000_000)];
  const missed = new Map<string, number>();
  let maxCells = 0, maxEvents = 0, maxKf = 0, maxSimMs = 0, maxRunJson = 0, maxStateJson = 0;
  let redisCallsWorst = 0;

  for (let day = 1; day <= SEASON_DAY_CAP; day++) {
    if (useDecay && day > 1) {
      const rm = new Set<string>();
      for (const c of cells) {
        const id = cellId(c.c, c.r);
        if ((missed.get(id) ?? 0) >= DECAY_UNTOUCHED_RUNS) rm.add(id);
      }
      redisCallsWorst = Math.max(redisCallsWorst, cells.length * 2);
      cells = cells.filter((c) => !rm.has(cellId(c.c, c.r)));
    }
    const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
    const t0 = performance.now();
    const res = simulate(cells, deepest);
    const simMs = performance.now() - t0;

    const touched = new Set(res.events.map((e) => e.cell));
    for (const c of cells) {
      const id = cellId(c.c, c.r);
      missed.set(id, touched.has(id) ? 0 : (missed.get(id) ?? 0) + 1);
    }
    if (res.stuckOn) cells = cells.filter((c) => cellId(c.c, c.r) !== res.stuckOn);

    const wire = cells.map((m) => ({ c: m.c, r: m.r, part: m.part, orient: m.orient, owner: m.owner }));
    const runJson = JSON.stringify({
      date: '2026-07-13', season: 1, day, keyframes: res.keyframes, events: res.events,
      reach: res.reach, prevRecord: 0, record: res.reach, goal: 5120, state: 'record', quiet: false,
      escape: res.escape, contributions: res.contributions, cappingCell: res.cappingCell,
      topContributors: [], dissolved: 0, cells: wire,
    }).length;
    const stateJson = JSON.stringify({
      type: 'state', postId: 't3_abcdefg', season: 1, day, cells: wire,
      frontier: coneCells(res.escape.c, res.escape.r, new Set(cells.map((c) => cellId(c.c, c.r)))),
      deepestRow: deepest, reach: res.reach, record: res.reach, goal: 5120,
      latestRunDate: '2026-07-13', hasNewRunForUser: true, nextRunAtMs: Date.now(), serverNowMs: Date.now(),
      builders: 40, ledger: { placed: 900, dissolved: 700 }, carrying: 20,
      lastContributions: res.contributions,
      lastPath: res.keyframes.filter((_, i) => i % 2 === 0).map((k) => ({ x: k.x, y: k.y })),
      user: { username: 'someredditor', placedToday: false, streak: 3, longestStreak: 9, lifetimePx: 1234, bestPartPx: 300, yourCells: [] },
    }).length;

    maxCells = Math.max(maxCells, cells.length);
    maxEvents = Math.max(maxEvents, res.events.length);
    maxKf = Math.max(maxKf, res.keyframes.length);
    maxSimMs = Math.max(maxSimMs, simMs);
    maxRunJson = Math.max(maxRunJson, runJson);
    maxStateJson = Math.max(maxStateJson, stateJson);

    const occupied = new Set(cells.map((c) => cellId(c.c, c.r)));
    const frontier = coneCells(res.escape.c, res.escape.r, occupied);
    for (let p = 0; p < placersPerDay; p++) {
      const open = frontier.filter((id) => !occupied.has(id));
      if (!open.length) break;
      const id = open[Math.floor(rand() * open.length)]!;
      const { c, r } = parseCell(id);
      const part = PART_LIST[Math.floor(rand() * PART_LIST.length)]!;
      const orients = PARTS[part].orientations;
      cells.push({ c, r, part, orient: orients[Math.floor(rand() * orients.length)]!, owner: `u${p}`, placedAt: day * 86400000 });
      occupied.add(id);
    }
  }
  return { maxCells, maxEvents, maxKf, maxSimMs, maxRunJson, maxStateJson, redisCallsWorst };
}

for (const decay of [true, false]) {
  for (const placers of [4, 20, 50, 200]) {
    const agg = { maxCells: 0, maxEvents: 0, maxKf: 0, maxSimMs: 0, maxRunJson: 0, maxStateJson: 0, redisCallsWorst: 0 };
    for (let s = 1; s <= 4; s++) {
      const r = season(s * 7919, placers, decay);
      for (const k of Object.keys(agg) as (keyof typeof agg)[]) agg[k] = Math.max(agg[k], r[k]);
    }
    console.log(
      `decay=${decay ? 'ON ' : 'OFF'} placers/day=${String(placers).padStart(3)} | ` +
      `peak cells=${String(agg.maxCells).padStart(4)} | events=${String(agg.maxEvents).padStart(4)} | kf=${String(agg.maxKf).padStart(3)} | ` +
      `sim=${agg.maxSimMs.toFixed(1).padStart(6)}ms | runJSON=${(agg.maxRunJson / 1024).toFixed(1).padStart(5)}KB | ` +
      `stateJSON=${(agg.maxStateJson / 1024).toFixed(1).padStart(5)}KB | decayRedisCalls=${agg.redisCallsWorst}`
    );
  }
}
