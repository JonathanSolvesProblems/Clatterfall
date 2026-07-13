/**
 * Local visual harness: serves the built client (dist/client) plus MOCKED /api
 * routes backed by the REAL simulation, so we can screenshot the actual game in
 * a browser without deploying to Devvit. Dev-only; not part of the app bundle.
 *
 *   npx tsx tools/harness.ts        # serves on http://localhost:7420
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { starterCells } from '../src/server/core/seed';
import { simulate } from '../src/server/sim/engine';
import { cellId, coneCells, seasonGoalPx } from '../src/shared/geometry';
import type { PlaceRequest, RunResponse, StateResponse, WireCell } from '../src/shared/api';

const PORT = 7420;
const DIST = join(process.cwd(), 'dist', 'client');
const NOW = 1_000_000;

// Build a real machine + run from the seed.
const machine = starterCells(NOW);
const deepest = machine.reduce((m, c) => Math.max(m, c.r), 0);
const sim = simulate(machine, deepest);
const wire: WireCell[] = machine.map((c) => ({ c: c.c, r: c.r, part: c.part, orient: c.orient, owner: c.owner }));
const frontier = coneCells(sim.escape.c, sim.escape.r, new Set(machine.map((c) => cellId(c.c, c.r))));
const goal = seasonGoalPx(1);
const prevRecord = Math.max(0, sim.reach - 380);
const yourCells = wire.slice(0, 2).map((c) => cellId(c.c, c.r));

const baseState: StateResponse = {
  type: 'state',
  postId: 'harness',
  season: 1,
  day: 12,
  cells: wire,
  frontier,
  deepestRow: deepest,
  reach: sim.reach,
  record: sim.reach,
  goal,
  latestRunDate: '2026-07-07',
  hasNewRunForUser: false, // harness: show the build/place flow by default; ?scene=run forces the run
  nextRunAtMs: NOW + 5 * 3600_000,
  serverNowMs: NOW,
  builders: 7,
  lastContributions: sim.contributions,
  lastPath: sim.keyframes.filter((_, i) => i % 2 === 0).map((k) => ({ x: k.x, y: k.y })),
  user: {
    username: 'demo_builder',
    placedToday: false,
    streak: 6,
    longestStreak: 9,
    lifetimePx: 4210,
    bestPartPx: 340,
    yourCells,
  },
};

const runPayload: RunResponse = {
  type: 'run',
  date: '2026-07-07',
  season: 1,
  day: 12,
  keyframes: sim.keyframes,
  events: sim.events,
  reach: sim.reach,
  prevRecord,
  record: sim.reach,
  goal,
  state: 'record',
  quiet: false,
  contributions: sim.contributions,
  cappingCell: '',
  cells: wire,
};

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

const json = (res: import('node:http').ServerResponse, body: unknown): void => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/api/state') return json(res, baseState);
  if (path.startsWith('/api/run/')) return json(res, runPayload);
  if (path === '/api/preview') return json(res, { ...runPayload, date: 'preview' });
  if (path === '/api/watched') return json(res, { ok: true });
  if (path === '/api/vote') return json(res, { ok: true, up: 1, down: 0 });
  if (path === '/api/place') {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as PlaceRequest;
      json(res, {
        ok: true,
        cell: { c: body.c, r: body.r, part: body.part, orient: body.orient, owner: 'demo_builder' },
        frontier: frontier.filter((f) => f !== cellId(body.c, body.r)),
        streak: 7,
      });
    });
    return;
  }

  const file = path === '/' ? 'splash.html' : path.slice(1);
  const full = join(DIST, file);
  if (existsSync(full)) {
    res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' });
    res.end(readFileSync(full));
    return;
  }
  res.writeHead(404).end('not found');
}).listen(PORT, () => {
  console.log(`[harness] http://localhost:${PORT}/game.html  (reach=${sim.reach}px, ${wire.length} parts, ${frontier.length} frontier)`);
});
