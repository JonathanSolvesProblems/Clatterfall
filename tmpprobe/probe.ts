import { simulate } from '../src/server/sim/engine';
import { starterCells } from '../src/server/core/seed';
import { buildStaticBodies } from '../src/server/sim/matterBodies';
import { PARTS } from '../src/shared/parts';
import type { Cell, PartId } from '../src/shared/types';

const seed = starterCells(1_000_000);
const deepest = seed.reduce((m, c) => Math.max(m, c.r), 0);
const res = simulate(seed, deepest);
const lastT = res.keyframes[res.keyframes.length - 1]!.t;
console.log(`SEED: reach=${res.reach} totalT=${lastT}ms kfs=${res.keyframes.length} bodies=${buildStaticBodies(seed, deepest + 2).length} parts=${seed.length}`);

function mk(n: number, mix: 'testmix' | 'realmix'): Cell[] {
  const cells: Cell[] = [];
  let r = 1;
  for (let i = 0; i < n; i++) {
    const c = i % 8;
    let part: PartId;
    if (mix === 'testmix') part = i % 5 === 0 ? 'bouncer' : 'ramp';
    else part = i % 4 === 0 ? 'chute' : i % 4 === 1 ? 'funnel' : i % 4 === 2 ? 'bouncer' : 'ramp';
    const orients = PARTS[part].orientations;
    cells.push({ c, r, part, orient: orients[i % orients.length]!, owner: 'u', placedAt: 1 });
    if (c === 7) r++;
  }
  return cells;
}

for (const [n, mix] of [[200, 'testmix'], [200, 'realmix'], [400, 'testmix'], [400, 'realmix']] as const) {
  const cells = mk(n, mix);
  const dp = cells.reduce((m, x) => Math.max(m, x.r), 0);
  const bodies = buildStaticBodies(cells, dp + 2).length;
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) { const s = performance.now(); simulate(cells, dp); runs.push(performance.now() - s); }
  runs.sort((a, b) => a - b);
  console.log(`${n} parts (${mix}): ${bodies} bodies, median ${runs[2]!.toFixed(1)}ms`);
}
