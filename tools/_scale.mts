/** Season-scale growth probe. Grows the machine with legal cone-constrained play. */
import { simulate } from '../src/server/sim/engine';
import { starterCells } from '../src/server/core/seed';
import { coneCells, cellId, parseCell } from '../src/shared/geometry';
import { PARTS } from '../src/shared/parts';
import type { Cell, PartId } from '../src/shared/types';

const PART_IDS = Object.keys(PARTS) as PartId[];
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function grow(daysMax: number, usersPerDay: number) {
  let cells: Cell[] = starterCells(Date.now());
  const rows: any[] = [];
  for (let day = 1; day <= daysMax; day++) {
    const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
    const t0 = performance.now();
    const sim = simulate(cells, deepest);
    const ms = performance.now() - t0;

    const occupied = new Set(cells.map((c) => cellId(c.c, c.r)));
    const cone = coneCells(sim.escape.c, sim.escape.r, occupied);
    const placeable = Math.min(usersPerDay, cone.length);

    const runJson = JSON.stringify({
      date: '2026-07-13', season: 1, day, keyframes: sim.keyframes, events: sim.events,
      reach: sim.reach, prevRecord: 0, record: sim.reach, goal: 5120, state: 'record', quiet: false,
      contributions: sim.contributions, cappingCell: '', topContributors: [], dissolved: 0,
      cells: cells.map((c) => ({ c: c.c, r: c.r, part: c.part, orient: c.orient, owner: c.owner })),
    });
    const stateJson = JSON.stringify({
      cells: cells.map((c) => ({ c: c.c, r: c.r, part: c.part, orient: c.orient, owner: c.owner })),
      frontier: cone,
      lastContributions: sim.contributions,
      lastPath: sim.keyframes.filter((_, i) => i % 2 === 0).map((k) => ({ x: k.x, y: k.y })),
    });

    rows.push({
      day, parts: cells.length, deepest, reach: sim.reach, simMs: +ms.toFixed(1),
      kfs: sim.keyframes.length, events: sim.events.length,
      coneFree: cone.length, placed: placeable,
      runKB: +(runJson.length / 1024).toFixed(1),
      stateKB: +(stateJson.length / 1024).toFixed(1),
      lastKfT: sim.keyframes[sim.keyframes.length - 1]?.t,
    });

    // shuffle cone, place `placeable` parts
    const picks = cone.slice().sort(() => rnd() - 0.5).slice(0, placeable);
    for (const id of picks) {
      const { c, r } = parseCell(id);
      const part = PART_IDS[Math.floor(rnd() * PART_IDS.length)]!;
      const os = PARTS[part].orientations;
      cells.push({ c, r, part, orient: os[Math.floor(rnd() * os.length)]!, owner: `u${Math.floor(rnd() * 500)}`, placedAt: Date.now() });
    }
  }
  return rows;
}

for (const users of [3, 25, 200]) {
  console.log(`\n=== ${users} placements attempted/day, 30 days ===`);
  const rows = grow(30, users);
  console.table(rows);
}
