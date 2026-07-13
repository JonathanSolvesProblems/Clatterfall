/**
 * Turns the placed machine into headless Matter.js static bodies. The exact
 * same {@link Primitive}s that the client draws are used here, so the collision
 * surface always matches the picture. Import ONLY Bodies (no Render/Runner).
 */
import Matter from 'matter-js';
import type { Cell } from '../../shared/types';
import { PARTS } from '../../shared/parts';
import { cellCenter } from '../../shared/geometry';
import { CELL, WORLD_WIDTH } from '../../shared/constants';

const { Bodies } = Matter;

const WALL_THICK = 60;

/** Build shaft walls, the catch floor, and every placed part as static bodies. */
export function buildStaticBodies(cells: Cell[], catchRow: number): Matter.Body[] {
  const bodies: Matter.Body[] = [];
  const worldBottom = (catchRow + 4) * CELL;
  const wallH = worldBottom + CELL * 4;

  // Left & right shaft walls (the anti-chaos boundary that folds the weave inward).
  bodies.push(
    Bodies.rectangle(-WALL_THICK / 2, wallH / 2 - CELL * 2, WALL_THICK, wallH, {
      isStatic: true,
      restitution: 0.1,
      friction: 0.2,
      label: 'wall',
    })
  );
  bodies.push(
    Bodies.rectangle(WORLD_WIDTH + WALL_THICK / 2, wallH / 2 - CELL * 2, WALL_THICK, wallH, {
      isStatic: true,
      restitution: 0.1,
      friction: 0.2,
      label: 'wall',
    })
  );

  // Soft catch floor: always below the deepest part, guaranteeing a rest state.
  bodies.push(
    Bodies.rectangle(WORLD_WIDTH / 2, catchRow * CELL + CELL / 2, WORLD_WIDTH + WALL_THICK * 2, 24, {
      isStatic: true,
      restitution: 0.04,
      friction: 0.6,
      label: 'floor',
    })
  );

  for (const cell of cells) {
    const def = PARTS[cell.part];
    const center = cellCenter(cell.c, cell.r);
    const label = `${cell.c}:${cell.r}`;
    for (const p of def.primitives(cell.orient)) {
      if (p.kind === 'circle') {
        bodies.push(
          Bodies.circle(center.x + p.x, center.y + p.y, p.r, {
            isStatic: true,
            restitution: def.restitution,
            friction: def.friction,
            label,
          })
        );
      } else {
        bodies.push(
          Bodies.rectangle(center.x + p.x, center.y + p.y, p.w, p.h, {
            isStatic: true,
            restitution: def.restitution,
            friction: def.friction,
            angle: p.angle,
            label,
          })
        );
      }
    }
  }

  return bodies;
}
