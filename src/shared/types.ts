/** Core shared types for Clatterfall. DOM-free (shared by client + server). */

export type Vec = { x: number; y: number };

/** The four static part types (spinner + seesaw were cut to keep only the marble dynamic). */
export type PartId = 'ramp' | 'chute' | 'bouncer' | 'funnel';

export type Material = 'wood' | 'brass' | 'steel';

/**
 * A physics/draw primitive in LOGICAL px, offset from its cell's center.
 * The exact same primitives feed the server Matter bodies and the client
 * Graphics draw, so the drawn shape always matches the collision surface.
 */
export type Primitive =
  | { kind: 'box'; x: number; y: number; w: number; h: number; angle: number }
  | { kind: 'circle'; x: number; y: number; r: number };

/** Static definition of a part type (shared by sim + render). */
export type PartDef = {
  id: PartId;
  name: string;
  material: Material;
  restitution: number;
  friction: number;
  /** Valid orientation keys, in palette order. */
  orientations: readonly string[];
  /** Primitives for a given orientation, relative to cell center (logical px). */
  primitives: (orient: string) => Primitive[];
};

/** A placed part occupying one grid cell. */
export type Cell = {
  c: number;
  r: number;
  part: PartId;
  orient: string;
  owner: string;
  placedAt: number; // ms epoch
};

/** One recorded moment of the marble during the daily run (quantized ints). */
export type Keyframe = {
  t: number; // ms since run start
  x: number; // logical px
  y: number; // logical px
  rot: number; // centi-degrees
  vx: number; // logical px/step * 100
  vy: number;
  touch: string; // cellId of last-touched part, '' if none
};

/** A part-contact during the run, used to drive activation flashes + pitched audio. */
export type CollisionEvent = {
  cell: string; // cellId
  part: PartId;
  material: Material;
  t: number; // ms since run start
  v: number; // impact speed (drives volume/pitch)
};

export type CliffhangerState =
  | 'record' // beat the season record
  | 'tied' // within epsilon of the record
  | 'capped' // fell short of the record
  | 'goal' // reached the season goal basin
  | 'quiet' // no new parts today
  | 'firstday'; // the very first run

/** A redditor and the px their parts carried the marble on one run. */
export type Contributor = {
  name: string;
  px: number;
};

/** The authoritative result of one daily run. */
export type RunResult = {
  date: string; // YYYY-MM-DD (UTC)
  season: number;
  day: number; // 1-based day of season
  keyframes: Keyframe[];
  events: CollisionEvent[];
  reach: number; // logical px depth reached
  prevRecord: number;
  record: number;
  goal: number;
  state: CliffhangerState;
  quiet: boolean;
  escape: { c: number; r: number };
  contributions: Record<string, number>; // cellId -> +px credited
  cappingCell: string; // cellId that capped the run, '' if none
  topContributors: Contributor[]; // who carried the marble furthest today (max 3)
};
