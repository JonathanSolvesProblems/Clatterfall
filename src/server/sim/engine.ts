/**
 * The authoritative daily simulation. Runs ONCE per day on the server, headless,
 * and emits a compact keyframe path the clients replay as tweens (so the run is
 * pixel-identical on every device, so cross-device physics drift is impossible).
 *
 * Also computes REACH (max depth) and per-part contribution credit using a
 * high-water-mark accumulator: whenever the marble sets a new global max depth,
 * the delta is credited to whichever part it last touched. By construction the
 * contributions sum EXACTLY to REACH, even when a bouncer sends the marble up.
 */
import Matter from 'matter-js';
import type { Cell, CollisionEvent, Keyframe, Material, PartId } from '../../shared/types';
import { PARTS } from '../../shared/parts';
import { buildStaticBodies } from './matterBodies';
import { catchFloorRow, colOfX, rowOfY } from '../../shared/geometry';
import {
  CELL,
  DROPPER_CELL,
  DROPPER_X,
  KEYFRAME_FREEFALL_MS,
  MARBLE_RADIUS,
  MAX_KEYFRAMES,
  MAX_SIM_STEPS,
  REST_SPEED,
  REST_STEPS,
  SIM_DT_MS,
} from '../../shared/constants';

const { Engine, Composite, Bodies, Events } = Matter;

export type SimResult = {
  keyframes: Keyframe[];
  events: CollisionEvent[];
  reach: number; // logical px depth
  contributions: Record<string, number>; // cellId ('' = unowned free-fall) -> +px
  escape: { c: number; r: number };
  cappingCell: string;
  /**
   * The cell the marble got JAMMED on: it came to rest on this part instead of
   * ever reaching the catch floor. Such a part would cap the machine forever
   * (and, being touched every run, could never decay), so the daily run
   * dissolves it. This is what guarantees the machine can never stay bricked.
   */
  stuckOn: string;
};

const q = (n: number): number => Math.round(n);

export function simulate(cells: Cell[], deepestRow: number): SimResult {
  const engine = Engine.create();
  engine.gravity.y = 1;
  engine.enableSleeping = false;

  const catchRow = catchFloorRow(deepestRow);
  const statics = buildStaticBodies(cells, catchRow);
  const marble = Bodies.circle(DROPPER_X, -CELL * 0.5, MARBLE_RADIUS, {
    restitution: 0.3,
    friction: 0.02,
    frictionAir: 0,
    density: 0.02,
    slop: 0.02,
    label: 'marble',
  });
  Composite.add(engine.world, [...statics, marble]);

  const partAt = new Map<string, { part: PartId; material: Material }>();
  for (const cell of cells) {
    partAt.set(`${cell.c}:${cell.r}`, { part: cell.part, material: PARTS[cell.part].material });
  }

  const keyframes: Keyframe[] = [];
  const events: CollisionEvent[] = [];
  const contributions: Record<string, number> = {};

  let simTimeMs = 0;
  let lastTouch = ''; // cellId of the last part touched ('' before first contact)
  let lastContact = { x: DROPPER_X, y: 0 }; // dropper lip is the day-1 escape anchor
  let collidedThisStep = false;
  let maxDepth = 0;

  Events.on(engine, 'collisionStart', (evt: Matter.IEventCollision<Matter.Engine>) => {
    for (const pair of evt.pairs) {
      const la = pair.bodyA.label;
      const lb = pair.bodyB.label;
      const cellLabel = la === 'marble' ? lb : lb === 'marble' ? la : '';
      if (!cellLabel) continue;
      const info = partAt.get(cellLabel);
      if (!info) continue; // wall or floor, not an attributable part
      lastTouch = cellLabel;
      lastContact = { x: marble.position.x, y: marble.position.y };
      collidedThisStep = true;
      const speed = Math.hypot(marble.velocity.x, marble.velocity.y);
      events.push({ cell: cellLabel, part: info.part, material: info.material, t: simTimeMs, v: Math.round(speed * 100) / 100 });
    }
  });

  const pushKeyframe = () => {
    keyframes.push({
      t: q(simTimeMs),
      x: q(marble.position.x),
      y: q(marble.position.y),
      rot: q((marble.angle * 180) / Math.PI * 100),
      vx: q(marble.velocity.x * 100),
      vy: q(marble.velocity.y * 100),
      touch: lastTouch,
    });
  };

  pushKeyframe();
  let lastKfTime = 0;
  let restCounter = 0;

  for (let step = 0; step < MAX_SIM_STEPS; step++) {
    simTimeMs += SIM_DT_MS;
    Engine.update(engine, SIM_DT_MS); // collisionStart may set collidedThisStep

    // High-water-mark depth attribution.
    const depth = marble.position.y;
    if (depth > maxDepth) {
      contributions[lastTouch] = (contributions[lastTouch] ?? 0) + (depth - maxDepth);
      maxDepth = depth;
    }

    const emit = collidedThisStep || simTimeMs - lastKfTime >= KEYFRAME_FREEFALL_MS;
    if (emit && keyframes.length < MAX_KEYFRAMES) {
      pushKeyframe();
      lastKfTime = simTimeMs;
    }
    collidedThisStep = false;

    const speed = Math.hypot(marble.velocity.x, marble.velocity.y);
    restCounter = speed < REST_SPEED ? restCounter + 1 : 0;
    if (restCounter >= REST_STEPS) break;
  }

  // Final keyframe at rest.
  pushKeyframe();

  const reach = Math.max(0, Math.round(maxDepth));
  // Round contributions to ints and keep them summing to reach.
  reconcileContributions(contributions, reach);

  const escape =
    lastTouch === ''
      ? { c: DROPPER_CELL.c, r: DROPPER_CELL.r }
      : { c: Math.max(0, colOfX(lastContact.x)), r: Math.max(0, rowOfY(lastContact.y)) };

  // Did Pip actually make it down to the catch floor? The floor is a 24-tall slab
  // centred on the catch row, so at rest on it he sits ~(12 + radius) above centre.
  const floorCentreY = catchRow * CELL + CELL / 2;
  const restingOnFloorY = floorCentreY - 12 - MARBLE_RADIUS;
  const reachedFloor = marble.position.y >= restingOnFloorY - CELL * 0.5;
  const stuckOn = !reachedFloor && lastTouch !== '' ? lastTouch : '';

  return { keyframes, events, reach, contributions, escape, cappingCell: lastTouch, stuckOn };
}

/** Round each contribution to an int while preserving sum === reach exactly. */
function reconcileContributions(contrib: Record<string, number>, reach: number): void {
  let acc = 0;
  const keys = Object.keys(contrib);
  for (const k of keys) {
    const rounded = Math.round(contrib[k] ?? 0);
    contrib[k] = rounded;
    acc += rounded;
  }
  const drift = reach - acc;
  if (drift !== 0 && keys.length > 0) {
    // Dump any rounding drift onto the largest contributor.
    let bestKey = keys[0] as string;
    let best = -Infinity;
    for (const k of keys) {
      const v = contrib[k] ?? 0;
      if (v > best) {
        best = v;
        bestKey = k;
      }
    }
    contrib[bestKey] = (contrib[bestKey] ?? 0) + drift;
  }
}
