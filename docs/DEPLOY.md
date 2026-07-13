# Deploy and pilot runbook: Clatterfall

Everything here is done by you (Jonathan) because it needs an interactive Reddit login and a real subreddit. The code is submission-ready; this gets it live and seeds the adoption that wins judging.

## 0. Prerequisites
- Node 22+ (already have it).
- A Reddit account in good standing, connected to the Developer Platform.
- A small **test subreddit** you moderate (create one, e.g. `r/Clatterfall`). Private is fine for the pilot.

## 1. Log in and verify green
```bash
npm run login          # opens a browser to authorize the Devvit CLI
npm run type-check     # tsc: 0 errors
npm run lint           # eslint: 0 errors
npm run test           # vitest: all pass (geometry, headless sim, seed)
npm run build          # vite: client + server bundles
```

## 2. Register the app with Reddit (once)
The code exists locally, but Reddit does not know about the app yet. Without this,
`playtest` fails with *"Your app doesn't exist yet"*.

```bash
npx devvit init --force
```

**`--force` is required and it is safe here.** Plain `devvit init` sees the app is
already named in `devvit.json` and exits with "already initialized" without doing
anything. `--force` is what lets it proceed. Because you are already inside a
Devvit app, the CLI takes the "update the app name" path and **explicitly skips
copying a template** (it prints "the template will be ignored"). It does not touch
`src/`. Verified against `@devvit/cli/dist/commands/init.js` (the template copy only
runs when you are NOT already in a Devvit app).

What it actually does:
1. Opens the browser to create the app on the developer portal.
2. You pick the app name. Try `clatterfall`; names are globally unique, so if it
   is taken pick another (e.g. `clatterfall-game`). The CLI then updates the name
   in `devvit.json` and `package.json` for you.
3. You paste the code back into the terminal.
4. Runs `git init` (harmless) and `npm install`.

Afterwards, sanity-check nothing moved: `git status` should show your source intact,
and `npm run test` should still be green.

## 3. Playtest live on your subreddit
```bash
npx devvit playtest r/Clatterfall
```

> **No subreddit yet?** Run `npx devvit playtest` with **no argument**. Reddit's backend
> creates a throwaway playtest subreddit for you server-side and installs the app into it.
> You do not get to pick the name and it comes out private, so it is a good way to smoke-test
> the build but a bad place to host the judged demo post. Create `r/Clatterfall` (Public) for that.
> The CLI only auto-creates when no subreddit is passed, no `dev.subreddit` is set in
> `devvit.json`, and no `DEVVIT_SUBREDDIT` is in `.env`.

This installs a dev build and hot-reloads as you edit. On install the app:
- initialises game state (season 1, run hour 13:00 UTC),
- seeds a real 26-part starter machine and its opening frontier,
- creates the interactive post.

If you need another post later, use the subreddit's three-dot menu → **"Clatterfall: Create machine post."**

## 4. Drive the daily run on demand (for testing + the demo)
The cron fires once a day at 13:00 UTC. To advance the machine immediately without waiting, use the subreddit menu:
- **"Clatterfall: Run the machine now"**: decays dead parts, re-simulates the whole machine, advances the frontier, resolves the record/goal, and stores the run. Returning players will auto-play it.
- **"Clatterfall: Reseed starter machine"**: rebuilds a fresh starter cascade (use only if you want to reset).

To change the run hour, edit the cron in `devvit.json` (`scheduler.tasks.daily-run.cron`, currently `0 13 * * *`).

## 5. Seed real adoption (the most important step)

Architecture is invisible to judges; **placements and a real record are not.** This is the
only remaining task that changes the outcome.

### The timing trap: start today or lose a day permanently

The one-part-per-user-per-day lock is keyed to the **UTC calendar date**. You cannot force it,
skip it, or fake it. "Run the machine now" advances the *machine*, but it does **not** hand
anyone a fresh part. So the number of days in your headline number is decided entirely by the
wall clock.

Deadline is **Jul 15, 6:00pm PDT** (= Jul 16, 01:00 UTC). That leaves exactly three UTC days:

| UTC day | What has to happen |
| --- | --- |
| **Jul 13 (today)** | Recruit + everyone places their first part. Run the machine at the end of the day. |
| **Jul 14** | Everyone places part two. Run the machine. This is the day the record should visibly climb. |
| **Jul 15** | Everyone places part three. Run the machine. Screenshot + record the demo. |

Skip today and the best you can honestly write is "over 2 days."

**More people beats more days.** Each person is capped at one part per day, so a 12-person
cohort adds 12 parts/day while you personally can only ever add 1. Recruiting is strictly
higher-leverage than waiting.

### Recruitment copy (paste as-is)

> I built a thing for the Reddit games hackathon and I need a few people to break it with me.
>
> It's one giant marble machine that a whole community builds together. You get **one part per
> day**, and here's the catch: you can only build where yesterday's marble actually reached.
> Every morning the entire machine runs again, top to bottom, and everyone watches the same
> marble to see how deep it got. Parts the marble stops touching dissolve on their own.
>
> Takes about 20 seconds a day. Come place a part: [link]

Post it where you already have standing (a Discord you're in, a group chat, friends with Reddit
accounts). Do not spam subreddits you have no relationship with; that is a Reddit rules problem
and it will not get you 12 committed people anyway.

### Lock the one number

Every winning entry has a single number a judge can repeat in a room without notes. Fill in this
exact sentence and put it in the elevator pitch, the writeup, and the demo voiceover:

> **"___ redditors, one machine, ___ px deep over ___ days."**

The splash already renders "built by N redditors" live, so the number is visible **in-product**,
not merely claimed. Screenshot the grown machine for the writeup. This line beats any
architecture claim you could possibly make.

## 6. Publish for review
```bash
npm run launch         # = deploy (type-check + lint + test + upload) then devvit publish
```
This submits the app for Reddit's review. Once approved it can be installed by others and is eligible for the Featuring Program / Developer Funds.

## 7. Submit to the hackathon
- **App listing:** the app's page on developer.reddit.com.
- **Demo post:** the public post running the game on your subreddit. Judging is primarily on this post, so make sure the pilot machine is in place and the run auto-plays.
- Record the 60s demo from `demoscript.md` (local, not committed). Lead the Devpost writeup with the personal marble-box story from `README.md`, then your one number, then the run.
- **App icon:** already wired (`marketingAssets.icon` → `assets/icon.png`, 1024×1024, 30 KB). Regenerate any time with `npx tsx tools/make-icon.mts`.

**Claim the cheap parallel prizes (do both, ~20 min total):**
- **Best Feedback ($200 x5):** complete the Developer Platform satisfaction survey linked in the hackathon rules when you submit.
- **Devvit Helper Award ($500 x6):** answer a couple of other builders' questions in the hackathon Discord during the window. Low effort, separate prize pool.

### Staging a real scored cliffhanger for judges
The scored run fires once a day, so don't rely on the cron while demoing. Instead:
1. Place a genuinely good part (or have a pilot user place one).
2. Subreddit menu → **"Clatterfall: Run the machine now."** This is a real, scored run.
3. Reload the post. It auto-plays that run and resolves with a true **NEW RECORD**: confetti, the ruler's record pin sliding forward, and "your part carried it +N px".

That gives a judge the actual hook in a single sitting. The **Test run (preview)** button is deliberately non-scoring and shows a muted "Preview run" card, so don't use it for the record-break moment.

## Troubleshooting
- **"Your app doesn't exist yet, you'll need to run 'npx devvit init'":** the app is not registered with Reddit yet. Run `npx devvit init --force` (see step 2). Plain `init` without `--force` will just say "already initialized" and do nothing.
- **"App name is taken":** names are globally unique. Pick another in the wizard (e.g. `clatterfall-game`). The CLI rewrites `devvit.json` and `package.json` for you.
- **"redis"/"reddit" permission errors:** confirm `devvit.json` has `permissions.redis: true` and `permissions.reddit.enable: true` (it does).
- **Empty board on a fresh post:** the install trigger seeds it; if a post looks empty, run **"Reseed starter machine."**
- **The run looks identical two days running:** that's the "quiet day" path (nobody placed a new part). It's intentional; place a part, then run again.
- **matter-js in the server sandbox:** the sim imports only `Engine`/`Bodies`/`Composite` (never `Render`/`Runner`), which is DOM-free and runs headless. Verified locally; if a deploy ever complains, that import discipline is the thing to check.
