/** Screenshots + a scene-cycle regression check via the local harness. Run the harness first. */
import { chromium, type Browser } from 'playwright';

const BASE = 'http://localhost:7420';
const OUT = 'tools/shots';
const errors: string[] = [];

type Opts = {
  viewport: { width: number; height: number };
  wait?: number;
  clicks?: { x: number; y: number; after: number }[];
};

async function shot(browser: Browser, name: string, url: string, o: Opts): Promise<void> {
  const ctx = await browser.newContext({ viewport: o.viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] console.error: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(o.wait ?? 1500);
  for (const c of o.clicks ?? []) {
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(c.after);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  saved ${name}.png`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const mobile = { width: 390, height: 780 };
  const desktop = { width: 920, height: 760 };
  await shot(browser, 'splash-mobile', `${BASE}/`, { viewport: mobile, wait: 1300 });
  await shot(browser, 'build-mobile', `${BASE}/game.html?scene=build`, { viewport: mobile, wait: 1900 });
  await shot(browser, 'build-place', `${BASE}/game.html?scene=build`, {
    viewport: mobile,
    wait: 1900,
    clicks: [{ x: 250, y: 430, after: 800 }],
  });
  await shot(browser, 'popover', `${BASE}/game.html?scene=build`, {
    viewport: mobile,
    wait: 1900,
    clicks: [{ x: 110, y: 205, after: 700 }], // tap a placed ramp -> owner/vote popover
  });
  await shot(browser, 'preview-run', `${BASE}/game.html?scene=build`, {
    viewport: mobile,
    wait: 1900,
    clicks: [{ x: 195, y: 684, after: 2600 }], // tap "Test run (preview)" -> plays the run
  });
  await shot(browser, 'run-mid', `${BASE}/game.html?scene=run`, { viewport: mobile, wait: 2400 });
  // The money shot: the marble crossing the record line in slow motion.
  await shot(browser, 'run-recordline', `${BASE}/game.html?scene=run`, { viewport: mobile, wait: 5200 });
  await shot(browser, 'run-result', `${BASE}/game.html?scene=run`, { viewport: mobile, wait: 8000 });
  // Regression: Run -> dismiss result -> back to Build must NOT crash (singleton field reset).
  await shot(browser, 'cycle-back-build', `${BASE}/game.html?scene=run`, {
    viewport: mobile,
    wait: 8000,
    clicks: [
      { x: 195, y: 630, after: 1600 }, // tap result card to dismiss -> returns to Build
    ],
  });
  await shot(browser, 'build-desktop', `${BASE}/game.html?scene=build`, { viewport: desktop, wait: 1900 });
  await browser.close();

  if (errors.length) {
    console.log(`\nFAIL: ${errors.length} page error(s):`);
    for (const e of errors) console.log('  ' + e);
    process.exit(1);
  }
  console.log('done: no page errors');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
