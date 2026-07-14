# Clatterfall

**A whole subreddit builds one marble machine, but you can only build where yesterday's marble actually reached. Every morning the entire machine re-runs as a single canonical simulation that everyone watches together, and the parts the marble abandons dissolve.**

`r/Clatterfall` is one continuous descent, built by a crowd, one part per person per day. Nobody can build it alone. Everybody builds it together, and the machine keeps the parts that earn their place.

> **Why I built this.** I collected marbles as a kid and kept a box of them, the kind of small private hoard you take out and admire by yourself. Clatterfall is the inverse of that box. There is one marble, and it belongs to everyone. A whole subreddit builds the machine it runs down, one part a day, and every morning we all watch the same marble together. I wanted to take the thing I loved alone as a kid and turn it into something a community does at the same time.

---

## Prior art, and the exact delta

Crowd-built marble machines exist. [Marble Run](https://www.marblerun.at/) (2011, Mozilla Labs winner) and [xkcd 2916 "Machine"](https://xkcd.com/2916/) (2024) both had a crowd build a giant contraption together. I am not claiming to be the first, and it would be easy to check.

Here is what is actually different, and all three are load-bearing:

1. **A chain, not a quilt.** In every prior crowd-machine you author a *complete, self-contained cell in a private sandbox*, and the cells are stitched together by a fixed input/output contract. Here you may only build inside the **frontier**: the cells just past where the marble *actually made contact yesterday*. Your part is causally dependent on the community's previous parts and on the last simulation's outcome. You cannot build in isolation, and you cannot build ahead.
2. **One canonical run a day, watched together.** xkcd's machine deliberately does the opposite: it only simulates the visible viewport, and balls expire after 30 seconds, so no single end-to-end run of the whole artifact exists. Marble Run replays segments in submission order. Clatterfall re-simulates **the entire machine, top to bottom, once every morning**, stores it as a keyframe path, and every redditor watches the pixel-identical run and finds out together how deep it got.
3. **The artifact edits itself.** Parts the marble stops touching **dissolve**. A part that jams the marble dissolves the next morning. Nothing in this lineage prunes contributions by simulation outcome, so the machine is under constant negative selection: only what the marble actually uses survives.

What is *not* novel, and I claim no credit for it: "one contribution per person per period to a shared artifact" is r/place, the most famous thing Reddit has ever made.

## The hook

The return reason is a genuine daily cliffhanger, not a notification.

1. **Every morning** a scheduled job re-simulates the entire committed machine and launches one marble down it. You open the post to watch the marble thread the whole community contraption and find out: *did we set a new record, or did a bad part cap us short of the goal?*
2. **Then you spend your one part.** You get exactly one part per day. You snap it onto the machine's live *frontier* (the buildable cells just past where the marble currently reaches), argue in the comments about what to build next, and your streak ticks up.
3. **Tomorrow the marble runs again** through everything, including your part, and everyone comes back to see how far it went.

One marble. One warm hand-made contraption. One shared morning. That 8-second daily descent is the whole game.

## Why it's Reddit-y (and not "AI slop")

- **A collective artifact nobody could build alone.** It's the r/place ritual, but it's a *machine* and it *runs every single day*. The comment thread becomes the coordination arena ("someone put a bouncer at 4,6 so we stop hugging the left wall").
- **It has its own identity.** A warm, sunlit woodworker's-bench look: matte wood-and-brass parts, a paper-cream board, a single vermilion marble named Pip, a brass measuring-ruler for the depth gauge. Every pixel of the game is drawn from Phaser Graphics primitives at runtime (the feed card outside the game is hand-written HTML plus one inline SVG). **There are no sprite sheets, no stock art, and no AI-generated images anywhere in this project.** It is non-AI and proud, which is the right answer to a brief that explicitly warns against AI slop.
- **Scarcity makes each contribution matter.** One part per person per day, placed only on the shared frontier, means your single daily part is consequential, never spam.

## How it targets all four prizes

| Prize | How Clatterfall earns it |
| --- | --- |
| **Best App with a Hook ($15k)** | A true daily cliffhanger: a cron-fired run of the whole communal machine, plus one-part-a-day scarcity, streaks, and permanent visible progress toward a goal. |
| **Best Use of Phaser ($5k)** | The daily run is a money-shot no DOM/CSS app can fake, and it's Phaser doing the work: a camera-follow rig, real-time Graphics compositing (motion-trailed marble, impact flash rings, sawdust bursts), tween/easing choreography, camera-shake on a record break, and scene orchestration. **As the marble closes on the record line, playback dilates into slow motion and the camera leans in**, so the moment the whole community is waiting for actually plays like a moment. Everything you see in the game (parts, marble, ruler, record line, confetti) is drawn from Phaser primitives at runtime. No sprite sheets, no images, no AI art. |
| **Best Use of User Contributions ($3k)** | Every placed part *is* the content. Zero authoring friction, zero cold-start. Each part is signed, credited with the exact px it carried the marble, votable, and the daily result card names the top three carriers. |
| **Best Use of Retention Mechanics ($3k)** | Daily fresh content by construction (the run), streaks, a climbing collective record, seasons with a deepening goal, and comment-thread coordination. |

## The two hard problems, engineered out

A shared physics machine has two ways to fail. Both are solved by design, not luck.

- **Coordination (chaos and fragility).** Placement is grid-snapped, one part per cell (first commit wins, atomically), one part per user per day, and gated to the marble's live frontier. So hundreds of daily parts become a deliberate 2D contraption, never a chaotic pile and never a one-wide line. A bad part can only *cap distance*, never permanently brick the chain (a soft catch-floor is always maintained below the machine). Dead or downvoted parts decay and free their cell, so the machine self-heals. A part the marble actually used last run can never be voted out.
- **The frontier is the marble's own fall corridor.** Not a fan of cells below its last contact: the *actual path* it drops through on its way out of the machine, widened by one column each side. This started as an aesthetic choice and turned out to be load-bearing. When the frontier was a wide cone, most legal cells were places the marble would never visit, so most parts were touched by nothing, scored nothing, and dissolved; simulating a season, random players never improved the record **even once in 20 days**. Building where the marble genuinely goes is what makes a part able to matter.
- **Determinism (cross-device drift).** The marble is simulated **once, on the server**, per daily run, and stored as a compact keyframe path. Every client just replays those keyframes as tweens. There is no client-side physics, so the run is pixel-identical for every player on every device. Cross-device drift is structurally impossible.

## How it works

```
Devvit Web post
├─ splash.html      inline feed card (fast, no Phaser): live "Day N · deepest Xpx · next run in …"
└─ game.html        the Phaser app
     ├─ Build scene  the board, the pulsing frontier, tap→palette→rotate→PLACE, drag to explore the whole machine
     └─ Run scene    keyframe replay: camera follows the marble, parts flash + chime on contact, the ruler
                     fills toward the record pin, then NEW RECORD / TIED / CAPPED SHORT / GOAL resolves

Hono server (Node)
├─ /api/state        the machine, the frontier, the record/goal, your streak, the next-run countdown, builder count
├─ /api/place        atomic cell-claim (Redis hSetNX) + one-part-per-day lock + frontier validation
├─ /api/run/:date    the authoritative keyframe replay payload
├─ /api/preview      a non-scoring "test run" of the machine as it stands right now
├─ /api/vote         up/down a placed part (one vote per user per part)
└─ /internal/scheduler/daily-run   the cron: decay → simulate → advance frontier → resolve record/goal → store
```

**Two touches that close the loop and surface the community:**
- **Test run (preview).** The scored run only happens once a day (that 24h wait is the retention hook), but you can hit *Test run* any time. The server re-simulates the machine on demand (including the part you just placed) and the fresh result plays back instantly, non-scoring. It answers "did my part help?" without making you wait a day to find out. It is the same deterministic simulation the cron runs, so it *will* show you what tomorrow looks like if nobody else builds. That is a deliberate trade: a five-minute visitor who can never see their part move is a worse problem than a spoiled cliffhanger, and in a live community other people's parts land before the run anyway.
- **Every part is signed.** Tap any placed part to see who built it and how far it carried the marble last run ("u/alice's ramp, carried +118 px"), then vote to keep it or cut it. The result card names the three redditors whose parts carried the marble furthest today, and the splash shows "built by N redditors". The collective is visible, not abstract.

- **Physics:** `matter-js` (the same engine Phaser ships as `Phaser.Physics.Matter`) runs headless in the Devvit Node runtime. A 200-part machine, about 400 bodies and roughly what a full season looks like, simulates in **under 10ms**. That is measured, and a perf test asserts it, so it cannot quietly regress.
- **Scoring:** REACH is how deep the machine *carried* the marble, which is not the same as how deep the marble ended up. The catch floor always sits below the deepest part, so scoring the marble's final depth would make the record a function of where someone placed a part rather than where the marble went: dropping a part into a far corner the marble never touches would raise the record by ~192px while contributing nothing. So the score stops at the last moment a part still had hold of the marble. **The record can only move when the marble genuinely reaches something new.**
- **Scoring:** REACH is the marble's max depth. Per-part contribution uses a high-water-mark accumulator, so each part's credit sums *exactly* to REACH even when a bouncer sends the marble upward. That is how the result card can honestly say "your ramp carried it +269 px."
- **Storage:** Redis only. The machine is a sparse hash (`cell → part|orient|owner`), so unbounded depth is free. Atomic claims, the one-part-a-day lock, and the idempotent cron run-lock are all `hSetNX` hashes.
- **Parts (4, all static bodies so the marble is the only moving object):** Straight Ramp, Curved Chute, Bouncer, Funnel. Each is defined once as physics/draw primitives shared by the server sim and the client renderer, so the collision surface always matches the picture.

## The uniqueness claim

No other Reddit game combines **a single persistent community-owned physics machine + one-part-per-day scarcity + a daily cron-fired marble run that threads the entire collective contraption as a shared cliffhanger.**

It sits near three things a judge will recognize, and is none of them:
- **r/place** is the collective-artifact ritual, but a canvas doesn't *run*. This one does, every morning, and the run is the whole point.
- **Physics bridge-builders** (r/bridgedit) are per-post puzzles you solve *alone*; here there is one machine, forever, that nobody can build alone.
- **Depth-gauntlets where you drop helpers for other players** (Rock Bottom) are per-player runs against a shared board; here there is exactly *one marble* and *one collective score per day*, so the whole sub wins or stalls together on the same morning.

The delta in one line: it is the only one that is **one machine, one marble, one shared run a day.**

## Honest limitations and path to production

- **Seeded, not yet adopted.** A freshly installed post ships with a real, working 26-part starter cascade (built by the same greedy "extend the reach" logic the game rewards, so all 26 seed parts are genuinely on the marble's path). To make the record-chase real for judging, the machine needs a live cohort placing parts across several UTC days. That pilot is the single most important pre-submission task (see `docs/DEPLOY.md`).
- **Physics feel is playtest-bound.** The gravity/restitution/friction values are tuned to feel weighty and reliably rest, but a bigger part vocabulary would need more tuning. The four-static-part palette is a deliberate scope choice that keeps the marble the only dynamic body (which also protects determinism).
- **Cut for scope, easy to add later:** a zoomed-out minimap, a Hall of Machines gallery of finished seasons, and richer parts (a spinner and a seesaw were designed and deliberately deferred).
- **To production:** a longer season economy, per-subreddit tuning of the run hour and frontier width, and load-testing the cron at ~500 parts.

## Running it locally

```bash
npm install
npm run type-check   # tsc project references (shared / server / client)
npm run lint         # eslint, typed
npm run test         # vitest: geometry, headless sim + contribution attribution, seed validation
npm run build        # vite (client bundle + server bundle)
```

Because the game lives inside a Reddit post, there is also a **local visual harness** that serves the built client with mocked API routes backed by the real simulation, so you can see the actual game in a browser without deploying:

```bash
npx tsx tools/harness.ts     # http://localhost:7420/game.html
npx tsx tools/shoot.ts       # Playwright screenshots into tools/shots/
```

To deploy to a real subreddit, see **`docs/DEPLOY.md`**.

---

Built by [Jonathan Andrei](https://jonathanandrei.com), who still has the box of marbles.
