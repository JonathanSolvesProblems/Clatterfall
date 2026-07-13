/**
 * The board view: a single scaled container that renders the whole machine in
 * LOGICAL px (so keyframes map 1:1). Panning is just moving the container; the
 * board graphics are only redrawn when the machine changes. Works identically
 * on mobile and desktop, the shaft always fits the width, we only pan vertically.
 */
import type Phaser from 'phaser';
import type { WireCell } from '../../shared/api';
import { CELL, DROPPER_X, GRID_COLS, WORLD_WIDTH } from '../../shared/constants';
import { basinCols, cellCenter, seasonGoalRow } from '../../shared/geometry';
import { COLORS } from '../../shared/theme';
import { drawPart } from './draw';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class BoardView {
  readonly layer: Phaser.GameObjects.Container;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly frontierG: Phaser.GameObjects.Graphics;
  zoom = 1;
  viewW = 0;
  viewH = 0;

  constructor(scene: Phaser.Scene) {
    this.boardG = scene.add.graphics();
    this.frontierG = scene.add.graphics();
    this.layer = scene.add.container(0, 0, [this.boardG, this.frontierG]);
  }

  /** Right gutter reserved for the depth ruler so the board never sits under it. */
  static readonly GUTTER = 42;

  /** Rows of machine we always want in frame, so the board never looks empty. */
  static readonly MIN_VISIBLE_ROWS = 11;
  /** Vertical space taken by the top HUD strip plus the bottom button band. */
  static readonly CHROME_H = 260;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const avail = w - BoardView.GUTTER;
    const byWidth = (avail * 0.98) / WORLD_WIDTH;
    // Also cap by HEIGHT. Sizing on width alone made a short, wide desktop window
    // zoom right in, so only two or three parts were on screen (and clipped) and
    // the cold-open looked like an empty grid.
    const byHeight = (h - BoardView.CHROME_H) / (BoardView.MIN_VISIBLE_ROWS * CELL);
    this.zoom = clamp(Math.min(byWidth, byHeight), 0.4, 1.15);
    this.layer.setScale(this.zoom);
    this.layer.x = (avail - WORLD_WIDTH * this.zoom) / 2 + 2;
  }

  /** Position so logical y `focusY` sits at `anchorFrac` down the screen. */
  setFocus(focusY: number, anchorFrac = 0.5): void {
    this.layer.y = this.viewH * anchorFrac - focusY * this.zoom;
  }

  get layerY(): number {
    return this.layer.y;
  }

  /** Screen x of the board's right rail, so the depth ruler can dock to it. */
  get rightEdge(): number {
    return this.layer.x + WORLD_WIDTH * this.zoom;
  }

  setLayerY(y: number): void {
    this.layer.y = y;
  }

  focusRow(row: number, anchorFrac = 0.5): void {
    this.setFocus(row * CELL + CELL / 2, anchorFrac);
  }

  /** Add a display object (e.g. the marble) into the panning layer. */
  addToLayer(obj: Phaser.GameObjects.GameObject): void {
    this.layer.add(obj);
  }

  /** Convert a screen point to the grid cell under it. */
  screenToCell(px: number, py: number): { c: number; r: number } {
    const lx = (px - this.layer.x) / this.zoom;
    const ly = (py - this.layer.y) / this.zoom;
    return { c: Math.floor(lx / CELL), r: Math.floor(ly / CELL) };
  }

  /**
   * The route the marble actually took on the last run, as a faint dashed thread
   * behind the parts. Without it the parts read as unrelated debris; with it the
   * eye can trace a continuous path and the board finally reads as a machine.
   */
  private drawTracedPath(g: Phaser.GameObjects.Graphics, path: { x: number; y: number }[]): void {
    if (path.length < 2) return;
    g.lineStyle(2, COLORS.woodLo, 0.22);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as { x: number; y: number };
      const b = path[i] as { x: number; y: number };
      if (i % 2 === 0) continue; // dashed: skip every other segment
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let i = 0; i < path.length; i += 4) {
      const p = path[i] as { x: number; y: number };
      g.fillStyle(COLORS.woodLo, 0.16);
      g.fillCircle(p.x, p.y, 1.8);
    }
  }

  drawBoard(cells: WireCell[], deepestRow: number, season: number, lastPath: { x: number; y: number }[] = []): void {
    const goalRow = seasonGoalRow(season);
    const maxRow = Math.max(deepestRow + 8, goalRow + 3, 14);
    const g = this.boardG;
    g.clear();

    // Engraved grid (carved-groove look: an incised line + a lit offset line).
    g.lineStyle(1.5, COLORS.grid, 0.9);
    for (let r = 0; r <= maxRow; r++) g.lineBetween(0, r * CELL, WORLD_WIDTH, r * CELL);
    for (let c = 0; c <= GRID_COLS; c++) g.lineBetween(c * CELL, 0, c * CELL, maxRow * CELL);
    g.lineStyle(1, COLORS.paperHi, 0.85);
    for (let r = 0; r <= maxRow; r++) g.lineBetween(0, r * CELL + 1.5, WORLD_WIDTH, r * CELL + 1.5);
    for (let c = 0; c <= GRID_COLS; c++) g.lineBetween(c * CELL + 1.5, 0, c * CELL + 1.5, maxRow * CELL);

    // Shaft walls (wood posts) flanking the grid.
    g.fillStyle(COLORS.woodLo, 1);
    g.fillRect(-12, -CELL, 12, (maxRow + 2) * CELL);
    g.fillRect(WORLD_WIDTH, -CELL, 12, (maxRow + 2) * CELL);
    g.fillStyle(COLORS.woodHi, 0.5);
    g.fillRect(-3, -CELL, 2, (maxRow + 2) * CELL);
    g.fillRect(WORLD_WIDTH + 1, -CELL, 2, (maxRow + 2) * CELL);

    // Dropper lip at the top.
    g.fillStyle(COLORS.brass, 1);
    g.fillRect(DROPPER_X - 18, -8, 36, 7);
    g.fillStyle(COLORS.brassHi, 1);
    g.fillRect(DROPPER_X - 18, -8, 36, 2);

    // Goal basin: a glowing brass pocket at the season's alternating basin.
    const bcols = basinCols(goalRow);
    const bx = (bcols[0] ?? 0) * CELL;
    const bw = bcols.length * CELL;
    g.fillStyle(COLORS.goalReady, 0.16);
    g.fillRect(bx, goalRow * CELL, bw, CELL);
    g.lineStyle(3, COLORS.brass, 0.7);
    g.lineBetween(0, goalRow * CELL, WORLD_WIDTH, goalRow * CELL);
    g.lineStyle(4, COLORS.brass, 1);
    g.strokeRect(bx + 3, goalRow * CELL + 3, bw - 6, CELL - 6);

    // The marble's route from the last run, threaded behind the parts.
    this.drawTracedPath(g, lastPath);

    // Parts.
    for (const cell of cells) {
      const ctr = cellCenter(cell.c, cell.r);
      drawPart(g, cell.part, cell.orient, ctr.x, ctr.y, { alpha: cell.decaying ? 0.45 : 1 });
    }
  }

  /**
   * The buildable frontier. Drawn as dashed brass outlines with a "+" rather than
   * solid tiles: a slab of filled cells became the single biggest mass on screen
   * and the eye landed on the NON-machine first. An outline reads as an
   * invitation ("put something here") instead of an empty inventory slot, and it
   * survives a static screenshot, which a pulse alone does not.
   */
  drawFrontier(frontierCells: { c: number; r: number }[], pulse: number, selected?: string): void {
    const g = this.frontierG;
    g.clear();
    const DASH = 7;
    const GAP = 5;

    for (const { c, r } of frontierCells) {
      const x = c * CELL + 6;
      const y = r * CELL + 6;
      const s = CELL - 12;
      const isSel = selected === `${c}:${r}`;
      const a = isSel ? 1 : 0.55 + 0.3 * pulse;

      g.fillStyle(COLORS.frontier, isSel ? 0.3 : 0.08 + 0.05 * pulse);
      g.fillRoundedRect(x, y, s, s, 8);

      g.lineStyle(isSel ? 3 : 2, COLORS.frontierEdge, a);
      // Dashed square (Phaser Graphics has no dash mode, so step the segments).
      for (let o = 0; o < s; o += DASH + GAP) {
        const len = Math.min(DASH, s - o);
        g.lineBetween(x + o, y, x + o + len, y);
        g.lineBetween(x + o, y + s, x + o + len, y + s);
        g.lineBetween(x, y + o, x, y + o + len);
        g.lineBetween(x + s, y + o, x + s, y + o + len);
      }

      // A small "+" so the cell reads as an action, not an absence.
      const cx = x + s / 2;
      const cy = y + s / 2;
      const arm = isSel ? 10 : 7;
      g.lineStyle(isSel ? 3 : 2, COLORS.frontierEdge, a);
      g.lineBetween(cx - arm, cy, cx + arm, cy);
      g.lineBetween(cx, cy - arm, cx, cy + arm);
    }
  }

  clearFrontier(): void {
    this.frontierG.clear();
  }
}
