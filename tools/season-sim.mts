/**
 * Plays out simulated seasons so the balance claims in the README are reproducible
 * rather than asserted.
 *
 *   npx tsx tools/season-sim.mts
 *
 * This is the script that caught the two worst design bugs in the project:
 *
 * 1. REACH used to be the marble's final depth. The catch floor always sits below
 *    the deepest placed part, so the marble always fell to it, which made the score a
 *    pure function of where someone had placed a part rather than where the marble
 *    went. Dropping a part into a far corner the marble could never touch raised the
 *    record for free. Run with --rogue to see that the exploit is dead.
 *
 * 2. Once scoring was honest, this showed the machine barely grew: with a wide cone
 *    frontier and a shallow catch floor, RANDOM players never improved the record
 *    once in 20 days, because most legal cells were places the marble would never
 *    visit. That is what drove the fall-corridor frontier and the deeper floor.
 *
 * Deterministic (seeded PRNG), so the numbers below are reproducible.
 */
import { simulate } from '../src/server/sim/engine.ts';
import { starterCells } from '../src/server/core/seed.ts';
import { frontierFromPath, cellId, parseCell } from '../src/shared/geometry.ts';
import { DECAY_UNTOUCHED_RUNS } from '../src/shared/constants.ts';
import { PARTS, PART_LIST } from '../src/shared/parts.ts';
import type { Cell, PartId } from '../src/shared/types.ts';

const DAYS = 20;
const PLAYERS_PER_DAY = 6;

let seed = 7;
const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const deepestOf = (cs: Cell[]): number => cs.reduce((m, c) => Math.max(m, c.r), 0);

/** `tries` = how much thought a player puts in. 1 is a random tap. */
function playSeason(tries: number, label: string): void {
  seed = 7; // same crowd every time, so the comparison is fair
  let cells: Cell[] = [...starterCells(1_000_000)];
  const missed = new Map<string, number>();
  let record = 0;
  let placed = 0;
  let dissolved = 0;

  console.log(`\n=== ${label} (${PLAYERS_PER_DAY} players/day, ${DAYS} days, with decay) ===`);

  for (let day = 1; day <= DAYS; day++) {
    // The marble runs, then parts it has ignored for two runs dissolve.
    const pre = simulate(cells, deepestOf(cells));
    const touched = new Set(pre.events.map((e) => e.cell));
    const survivors: Cell[] = [];
    for (const c of cells) {
      const id = cellId(c.c, c.r);
      const m = touched.has(id) ? 0 : (missed.get(id) ?? 0) + 1;
      missed.set(id, m);
      if (m >= DECAY_UNTOUCHED_RUNS) {
        dissolved++;
        missed.delete(id);
      } else survivors.push(c);
    }
    cells = survivors;

    // The community spends its parts on today's frontier.
    const s = simulate(cells, deepestOf(cells));
    const taken = new Set(cells.map((c) => cellId(c.c, c.r)));
    const frontier = frontierFromPath(s.fallPath, s.escape.c, s.escape.r, taken);

    for (let p = 0; p < PLAYERS_PER_DAY; p++) {
      const open = frontier.filter((id) => !taken.has(id));
      if (!open.length) break;
      let best: { cell: Cell; reach: number } | null = null;
      for (let t = 0; t < tries; t++) {
        const id = open[Math.floor(rnd() * open.length)] as string;
        const { c, r } = parseCell(id);
        const part = PART_LIST[Math.floor(rnd() * PART_LIST.length)] as PartId;
        const orients = PARTS[part].orientations;
        const orient = orients[Math.floor(rnd() * orients.length)] as string;
        const cand: Cell = { c, r, part, orient, owner: `u${p}`, placedAt: 1 };
        const res = simulate([...cells, cand], Math.max(r, deepestOf(cells)));
        if (!best || res.reach > best.reach) best = { cell: cand, reach: res.reach };
      }
      if (best) {
        cells.push(best.cell);
        taken.add(cellId(best.cell.c, best.cell.r));
        placed++;
      }
    }

    const post = simulate(cells, deepestOf(cells));
    record = Math.max(record, post.reach);
    if (day <= 3 || day % 5 === 0) {
      console.log(
        `  day ${String(day).padStart(2)}  parts ${String(cells.length).padStart(3)}` +
          `  reach ${String(post.reach).padStart(5)}px  record ${String(record).padStart(5)}px` +
          `  frontier ${frontier.length}`
      );
    }
  }

  const pruned = Math.round((100 * dissolved) / Math.max(1, placed));
  console.log(`  --> record ${record}px | ${placed} placed, ${dissolved} dissolved (${pruned}% pruned by the marble)`);
}

/** The exploit that forced REACH to change: can an UNTOUCHED part raise the record? */
function rogueCheck(): void {
  const cells = starterCells(1_000_000);
  const d = deepestOf(cells);
  const base = simulate(cells, d);

  // Far column, several rows deeper: somewhere the marble cannot possibly reach.
  const rogue: Cell = { c: 0, r: d + 3, part: 'ramp', orient: 'L', owner: 'griefer', placedAt: 1 };
  const after = simulate([...cells, rogue], d + 3);
  const id = cellId(rogue.c, rogue.r);
  const wasTouched = new Set(after.events.map((e) => e.cell)).has(id);

  console.log('\n=== can a part the marble never touches still raise the record? ===');
  console.log(`  rogue part at ${id}: touched by the marble = ${wasTouched}`);
  console.log(`  record ${base.reach}px -> ${after.reach}px  (delta ${after.reach - base.reach}px)`);
  console.log(`  credited to the rogue part: ${after.contributions[id] ?? 0}px`);
  console.log(
    after.reach === base.reach && !wasTouched
      ? '  PASS: the marble decides. An untouched part earns nothing and moves nothing.'
      : '  FAIL: an untouched part still moves the record.'
  );
}

rogueCheck();
playSeason(1, 'RANDOM players (a tap with no thought)');
playSeason(3, 'players who try (best of 3)');
