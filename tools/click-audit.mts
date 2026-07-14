/**
 * Clicks EVERY interactive thing in the game and asserts it responds.
 *
 * A button that silently does nothing is the worst class of bug in this project:
 * it looks fine in a screenshot, it passes every unit test, and the player just
 * quietly gets stuck. We have already shipped two of them (a dead result card and a
 * coaching button that ignored you), so this walks the whole surface.
 *
 * Runs against the local harness, so it never touches the live subreddit.
 *
 *   npx tsx tools/harness.ts        # in one terminal
 *   npx tsx tools/click-audit.mts   # in another
 */
import { chromium, type Page } from 'playwright';

const BASE = 'http://localhost:7420';
const MOBILE = { width: 390, height: 780 };

type Result = { name: string; ok: boolean; note: string };
const results: Result[] = [];

const record = (name: string, ok: boolean, note = ''): void => {
  results.push({ name, ok, note });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/** Did clicking here change ANYTHING on screen? */
async function clickChanges(page: Page, x: number, y: number, settle = 700): Promise<boolean> {
  const before = await page.screenshot();
  await page.mouse.click(x, y);
  await page.waitForTimeout(settle);
  const after = await page.screenshot();
  return Buffer.compare(before, after) !== 0;
}

const errors: string[] = [];

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  // ---------------------------------------------------------------- BUILD SCENE
  console.log('\nBUILD SCENE');
  await page.goto(`${BASE}/game.html?scene=build`, { waitUntil: 'load' });
  await page.waitForTimeout(2400);

  // The coaching CTA: pressing it must point you at the cells, not ignore you.
  record('CTA "Tap a glowing cell to build" responds', await clickChanges(page, 195, 738, 900));

  // A frontier cell selects and opens the palette.
  record('frontier cell selects (opens palette)', await clickChanges(page, 240, 520));

  // Palette: all four parts, clicked at their BOTTOM-RIGHT corner, which is exactly
  // where the old hit-area bug made them dead.
  const tiles: [string, number][] = [
    ['Straight', 96],
    ['Curved', 162],
    ['Bouncer', 228],
    ['Funnel', 294],
  ];
  for (const [name, x] of tiles) {
    record(`palette tile "${name}" (bottom-right corner)`, await clickChanges(page, x + 22, 686));
  }

  // Rotation: tapping the same cell again must change the ghost.
  await page.mouse.click(240, 520);
  await page.waitForTimeout(500);
  record('rotation on repeat-tap of the cell', await clickChanges(page, 240, 520));

  // Place.
  record('Place button commits the part', await clickChanges(page, 195, 738, 1400));

  // ---------------------------------------------------------------- PART POPOVER
  console.log('\nPART POPOVER');
  await page.goto(`${BASE}/game.html?scene=build`, { waitUntil: 'load' });
  await page.waitForTimeout(2400);
  const popped = await clickChanges(page, 240, 268); // tap a placed part
  record('tapping a placed part opens the popover', popped);
  if (popped) {
    record('vote "keep" (bottom-right corner)', await clickChanges(page, 186, 648));
  }

  // ---------------------------------------------------------------- TEST RUN
  console.log('\nTEST RUN (preview)');
  await page.goto(`${BASE}/game.html?scene=build`, { waitUntil: 'load' });
  await page.waitForTimeout(2400);
  record('"Test run (preview)" starts a run', await clickChanges(page, 195, 684, 2600));

  // ---------------------------------------------------------------- RESULT CARD
  console.log('\nRESULT CARD');
  for (const [label, y] of [
    ['top', 520],
    ['middle', 640],
    ['"tap to continue"', 722],
    ['bottom edge', 735],
  ] as [string, number][]) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${BASE}/game.html?scene=run`, { waitUntil: 'load' });
    await p.waitForTimeout(13000);
    record(`result card dismisses at ${label}`, await clickChanges(p, 195, y, 1000));
    await p.close();
  }

  // ---------------------------------------------------------------- SCENE CYCLE
  console.log('\nSCENE CYCLE (the path that used to crash)');
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push(`cycle: ${e.message}`));
  await p2.goto(`${BASE}/game.html?scene=run`, { waitUntil: 'load' });
  await p2.waitForTimeout(13000);
  await p2.mouse.click(195, 640); // dismiss -> Build
  await p2.waitForTimeout(1600);
  const backInBuild = await clickChanges(p2, 240, 520); // can we still select a cell?
  record('run -> dismiss -> build is still interactive', backInBuild);
  await p2.close();

  await browser.close();

  // ---------------------------------------------------------------- REPORT
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(60));
  console.log(`${results.length - failed.length}/${results.length} interactions responded`);
  if (failed.length) {
    console.log('\nDEAD CONTROLS:');
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  if (errors.length) {
    console.log(`\n${errors.length} PAGE ERROR(S):`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.log(`  - ${e}`);
  }
  console.log('='.repeat(60));

  if (failed.length || errors.length) process.exit(1);
  console.log('every control responds, no page errors');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
