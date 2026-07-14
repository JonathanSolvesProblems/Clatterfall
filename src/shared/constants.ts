/**
 * Clatterfall: device-independent LOGICAL world constants.
 *
 * The entire game (physics, keyframes, scores, frontier math) is computed in
 * logical pixels where 1 grid cell = {@link CELL} logical px. Rendering scales
 * this per device (mobile ~44px/cell, desktop 64px/cell) but the simulation and
 * all stored numbers never change, so the marble run is identical everywhere.
 *
 * Shared by client and server. Keep DOM-free.
 */

/** Logical px per grid cell. All world math is in these units. */
export const CELL = 64;
/** Shaft width in cells (bounded, the anti-chaos wall). */
export const GRID_COLS = 8;
/** Shaft width in logical px. */
export const WORLD_WIDTH = CELL * GRID_COLS; // 512
/**
 * Marble radius in logical px. Pip is the hero and the emotional focus of every
 * run, so he is deliberately chunky relative to the 64px cell. Changing this
 * changes the physics: re-run `npx tsx tools/gen-seed.mts` afterwards.
 */
export const MARBLE_RADIUS = 17;

/** Marble enters at the CENTER of column 3 (a cell center, not a wall seam). */
export const DROPPER_X = 3 * CELL + CELL / 2; // 224
/** Fallback escape cell when the marble touches nothing (day 1, all-miss). */
export const DROPPER_CELL = { c: 3, r: 0 } as const;

// ---- Frontier (the coordination device) -------------------------------------
/** Rows below the escape point that become buildable each day. */
export const FRONTIER_DEPTH = 4;
/** Cone half-width at the escape row; widens by 1 per row: |c-cE| <= BASE + dr. */
export const CONE_BASE_HALF = 1;
/**
 * How far either side of the marble's actual fall corridor you may build.
 *
 * The frontier is the path the marble really takes once it leaves the machine, not
 * a wide fan of cells it will never visit. One column of slack on each side leaves
 * room to deliberately deflect it without letting people build somewhere it cannot
 * reach (a part the marble never touches earns nothing and dissolves).
 */
export const CORRIDOR_HALF = 1;
/**
 * The dropper row is never buildable. Pip needs clear air to fall into, and a
 * part placed directly under the spawn point could otherwise catch him at rest
 * before he ever gets moving.
 */
export const MIN_BUILD_ROW = 1;
/** If the cone has fewer free cells than this, extend it downward until it does. */
export const MIN_FRONTIER_CELLS = 6;

// ---- Goal & seasons ---------------------------------------------------------
/** Rows between checkpoint basins. */
export const GOAL_INTERVAL = 40;
/**
 * Season 1's goal depth, in rows (= 3,520 logical px).
 *
 * Row 80 was set back when reach was inflated by the catch floor, which moved down
 * every time anyone placed a deeper part. Now that reach is what the machine actually
 * carried the marble, a simulated 30-day season with a six-person cohort lands around
 * row 42-46, so row 80 was a goal nobody could ever hit. Row 55 is a stretch that an
 * active community can actually reach, which is the point of having a goal at all.
 */
export const SEASON1_GOAL_ROW = 55;
/** A season also ends after this many days if the goal is unmet. */
export const SEASON_DAY_CAP = 30;
/** A basin spans 2 cells: [side, side+1]. */
export const BASIN_WIDTH = 2;

/**
 * How far below the deepest part the soft catch floor sits.
 *
 * This must be at least FRONTIER_DEPTH + 2, and that is not cosmetic. The buildable
 * frontier is the corridor the marble falls through after the machine lets go of it,
 * so if the floor sits right under the machine the marble lands almost immediately
 * and there is barely any corridor to build into. At a gap of 2 the record flatlined
 * within a day; at 6 the machine keeps growing. The floor has to leave the marble
 * room to fall through the space the community is about to build in.
 *
 * Reproduce with `npx tsx tools/season-sim.mts`.
 */
export const CATCH_FLOOR_GAP = 6;

// ---- Simulation (server-only values, kept here so tests can share them) -----
/** Fixed-timestep rate for the authoritative sim. */
export const SIM_HZ = 60;
export const SIM_DT_MS = 1000 / SIM_HZ;
/** Hard cap on simulated time; after this the marble is damped to rest. */
export const MAX_SIM_TIME_S = 20;
export const MAX_SIM_STEPS = Math.ceil(MAX_SIM_TIME_S * SIM_HZ);
/** Speed (logical px/step) below which, sustained, the marble counts as resting. */
export const REST_SPEED = 0.55;
export const REST_TIME_S = 0.4;
export const REST_STEPS = Math.ceil(REST_TIME_S * SIM_HZ);

// ---- Keyframe recording -----------------------------------------------------
/** During free-fall, emit at least one keyframe per this interval. */
export const KEYFRAME_FREEFALL_MS = 110;
/** Safety cap so a payload never blows the mobile budget. */
export const MAX_KEYFRAMES = 240;

// ---- Anti-grief / decay -----------------------------------------------------
/** Net-downvotes at/above this (and aged) makes an unused part decay-eligible. */
export const DECAY_DOWNVOTE_THRESHOLD = 5;
/** A part must be at least this old before vote-decay can remove it (ms). */
export const DECAY_MIN_AGE_MS = 48 * 60 * 60 * 1000;
/**
 * Untouched for this many consecutive runs => the part dissolves. No exceptions.
 *
 * Votes cannot save it. The community can only ever ACCELERATE a removal (see
 * decay.ts), never veto one, because "nobody decides what stays, the marble does"
 * has to be true in the code and not just in the pitch.
 */
export const DECAY_UNTOUCHED_RUNS = 2;

/**
 * Owner recorded on the seeded starter parts. Declared once, here, because both
 * the server (seeding, contribution payouts, builder count) and the client
 * (showing "the workshop" instead of a u/ handle) have to agree on it exactly.
 */
export const HOUSE_OWNER = 'clatterfall';

/** Daily run hour (UTC) default; per-sub configurable via settings. */
export const DEFAULT_RUN_HOUR_UTC = 13;

/** REACH within this many px of the record counts as a TIE (not a new record). */
export const TIE_EPS_PX = 32;
