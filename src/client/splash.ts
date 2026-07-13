import { context, requestExpandedMode } from '@devvit/web/client';
import type { StateResponse } from '../shared/api';

const startButton = document.getElementById('start-button') as HTMLButtonElement | null;
const stat = document.getElementById('stat');
const ledger = document.getElementById('ledger');
const foot = document.getElementById('foot');

startButton?.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

const username = context?.username;
if (foot) foot.textContent = username ? `hey u/${username}, your part is waiting` : '';

// A quick, light status line to build anticipation in the feed (no heavy deps).
fetch('/api/state')
  .then((r) => r.json() as Promise<StateResponse>)
  .then((s) => {
    if (!stat || s?.type !== 'state') return;
    const remain = Math.max(0, s.nextRunAtMs - s.serverNowMs);
    const mins = Math.floor(remain / 60_000);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const deepest = Math.round(s.record).toLocaleString('en-US');
    const builders = s.builders > 0 ? ` · built by ${s.builders} redditor${s.builders > 1 ? 's' : ''}` : '';
    stat.textContent = `Day ${s.day} · deepest ${deepest}px · next run in ${hh}h ${mm}m${builders}`;

    // The survival ledger. This is the one line that proves the machine really does
    // prune itself, rather than merely claiming to.
    const led = s.ledger;
    if (ledger && led && led.placed > 0) {
      const n = (v: number): string => v.toLocaleString('en-US');
      ledger.textContent = `${n(led.placed)} parts placed · ${n(led.dissolved)} dissolved · ${n(s.carrying)} still carrying the marble`;
    }
  })
  .catch(() => {
    /* keep the static tagline */
  });
