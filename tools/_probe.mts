import { simulate } from '../src/server/sim/engine';
import { PARTS } from '../src/shared/parts';
import type { Cell, PartId } from '../src/shared/types';
import { MAX_SIM_TIME_S, SEASON1_GOAL_ROW, CELL, MAX_KEYFRAMES } from '../src/shared/constants';

const mk = (c: number, r: number, part: PartId, orient: string): Cell => ({ c, r, part, orient, owner: 'x', placedAt: 0 });

console.log(`goal = row ${SEASON1_GOAL_ROW} = ${SEASON1_GOAL_ROW * CELL}px ; sim cap = ${MAX_SIM_TIME_S}s ; MAX_KEYFRAMES=${MAX_KEYFRAMES}`);

// 1) Fastest plausible descent: a straight chute column down to row 79.
for (const partId of ['chute', 'ramp'] as PartId[]) {
  const cells: Cell[] = [];
  for (let r = 1; r <= 79; r++) {
    if (partId === 'chute') cells.push(mk(3, r, 'chute', '0'));
    else cells.push(mk(r % 2 ? 3 : 4, r, 'ramp', r % 2 ? 'R' : 'L'));
  }
  const t0 = performance.now();
  const s = simulate(cells, 79);
  const ms = performance.now() - t0;
  console.log(
    `${partId} column (${cells.length} parts): reach=${s.reach}px (row ${(s.reach / CELL).toFixed(1)}) ` +
    `simTime=${s.keyframes[s.keyframes.length - 1]?.t}ms kfs=${s.keyframes.length} events=${s.events.length} ` +
    `cpu=${ms.toFixed(0)}ms goalHit=${s.reach >= SEASON1_GOAL_ROW * CELL}`
  );
}

// 2) Worst-case CPU: a dense machine that rattles for the full 20s.
const PART_IDS = Object.keys(PARTS) as PartId[];
let sd = 999;
const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (const n of [100, 200, 300, 400, 500]) {
  const cells: Cell[] = [];
  const used = new Set<string>();
  while (cells.length < n) {
    const c = Math.floor(rnd() * 8);
    const r = 1 + Math.floor(rnd() * Math.ceil(n / 4));
    if (used.has(`${c}:${r}`)) continue;
    used.add(`${c}:${r}`);
    const p = PART_IDS[Math.floor(rnd() * PART_IDS.length)]!;
    const os = PARTS[p]!.orientations;
    cells.push(mk(c, r, p, os[Math.floor(rnd() * os.length)]!));
  }
  const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
  const t0 = performance.now();
  const s = simulate(cells, deepest);
  const ms = performance.now() - t0;
  const runKB = JSON.stringify({ keyframes: s.keyframes, events: s.events, contributions: s.contributions, cells }).length / 1024;
  console.log(
    `dense ${n} parts (deepest ${deepest}): cpu=${ms.toFixed(0)}ms simTime=${s.keyframes[s.keyframes.length - 1]?.t}ms ` +
    `kfs=${s.keyframes.length} events=${s.events.length} runKB=${runKB.toFixed(1)}`
  );
}
