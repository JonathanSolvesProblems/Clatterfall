import { starterCells } from '../src/server/core/seed';
import { simulate } from '../src/server/sim/engine';
import { coneCells, cellId } from '../src/shared/geometry';
import { CELL } from '../src/shared/constants';

const cells = starterCells(1_000_000);
const deepest = cells.reduce((m, c) => Math.max(m, c.r), 0);
const res = simulate(cells, deepest);
console.log('escape cell =', JSON.stringify(res.escape));
console.log('reach =', res.reach, 'px = row', (res.reach / CELL).toFixed(1));
console.log('deepest seed row =', deepest);

const occupied = new Set(cells.map((c) => cellId(c.c, c.r)));
const cone = coneCells(res.escape.c, res.escape.r, occupied);
console.log('frontier size =', cone.length);
const byCol: Record<number, number> = {};
for (const id of cone) {
  const c = Number(id.split(':')[0]);
  byCol[c] = (byCol[c] ?? 0) + 1;
}
console.log('frontier cells by column =', JSON.stringify(byCol));
const rows = [...new Set(cone.map((id) => Number(id.split(':')[1])))].sort((a, b) => a - b);
console.log('frontier rows =', rows.join(','));

const xs = res.keyframes.map((k) => k.x);
console.log(
  'marble x range =',
  Math.min(...xs).toFixed(0),
  '..',
  Math.max(...xs).toFixed(0),
  '(cols',
  Math.floor(Math.min(...xs) / CELL),
  '..',
  Math.floor(Math.max(...xs) / CELL),
  ')'
);
