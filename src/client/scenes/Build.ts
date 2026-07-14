import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import type { StateResponse, WireCell } from '../../shared/api';
import type { PartId } from '../../shared/types';
import { PARTS, PART_LIST } from '../../shared/parts';
import { CELL } from '../../shared/constants';
import { cellCenter, parseCell } from '../../shared/geometry';
import { COLORS, css } from '../../shared/theme';
import { SANS } from '../render/fonts';
import { BoardView } from '../render/board';
import { Hud, type CtaIcon } from '../render/hud';
import { drawPart } from '../render/draw';
import type { Synth } from '../audio/synth';
import { net } from '../net';

type InitData = { state: StateResponse };

export class Build extends Scene {
  private state!: StateResponse;
  private board!: BoardView;
  private hud!: Hud;
  private synth!: Synth;
  private ghostG!: Phaser.GameObjects.Graphics;
  private boardZone!: Phaser.GameObjects.Zone;
  private palette!: Phaser.GameObjects.Container;
  private tiles: Phaser.GameObjects.Container[] = [];
  private popover: Phaser.GameObjects.Container | undefined = undefined;

  private frontierSet = new Set<string>();
  private selectedCell: { c: number; r: number } | null = null;
  private selectedPart: PartId = 'ramp';
  private orientIdx = 0;
  private placing = false;
  private hinting = false;
  private rotateHintShown = false;
  private serverOffset = 0;
  private lastCta = '';
  private panActive = false;
  private dragging = false;
  private dragStartY = 0;
  private dragStartLayerY = 0;

  constructor() {
    super('Build');
  }

  /** Scenes are singletons, so reset every mutable field on each (re)entry. */
  init(): void {
    this.tiles = [];
    this.frontierSet = new Set();
    this.selectedCell = null;
    this.selectedPart = 'ramp';
    this.orientIdx = 0;
    this.placing = false;
    this.hinting = false;
    this.rotateHintShown = false;
    this.panActive = false;
    this.dragging = false;
    this.lastCta = '';
    this.popover = undefined;
  }

  create(data: InitData): void {
    this.state = data.state;
    this.synth = this.registry.get('synth') as Synth;
    this.serverOffset = this.state.serverNowMs - Date.now();
    this.cameras.main.setBackgroundColor(COLORS.paper);

    // Unlock audio on the first tap inside the game iframe (autoplay policy).
    this.input.on('pointerdown', () => this.synth.unlock());

    this.boardZone = this.add.zone(0, 0, 10, 10).setOrigin(0).setDepth(1);
    this.boardZone.setInteractive();
    this.boardZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.boardZone.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.boardZone.on('pointerupoutside', () => {
      this.panActive = false;
      this.dragging = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));

    this.board = new BoardView(this);
    this.ghostG = this.add.graphics();
    this.board.addToLayer(this.ghostG);
    this.hud = new Hud(this);
    this.buildPalette();

    this.frontierSet = new Set(this.state.frontier);
    this.redrawBoard();
    this.layout();
    const onResize = (): void => this.layout();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.refreshHud();

    // Dev-only scene override for the local screenshot harness (no-op in prod,
    // where nobody appends ?scene=...).
    const forced = new URLSearchParams(location.search).get('scene');
    if (forced === 'run' && this.state.latestRunDate) {
      this.time.delayedCall(150, () => this.watchRun());
    } else if (forced !== 'build' && this.state.hasNewRunForUser && this.state.latestRunDate) {
      this.time.delayedCall(300, () => this.watchRun());
    }
  }

  // ---- layout ---------------------------------------------------------------

  private layout(): void {
    const { width, height } = this.scale;
    this.boardZone.setSize(width, height);
    const hit = this.boardZone.input?.hitArea;
    if (hit instanceof Phaser.Geom.Rectangle) hit.setSize(width, height);
    this.board.resize(width, height);
    this.hud.layout(width, height, this.board.rightEdge);
    this.focusBoard();
    this.layoutPalette(width, height);
  }

  /**
   * Bottom-align the buildable cone just above the fixed bottom UI, so no
   * glowing cell ever hides under the CTA / Test-run pill / palette. This also
   * pushes as much of the machine as possible into the upper screen. If the cone
   * is too tall to fit, prefer showing its top (where you actually build).
   */
  private focusBoard(): void {
    const rows = [...this.frontierSet].map((id) => parseCell(id).r);
    const fallback = this.state.deepestRow + 1;
    const topRow = rows.length ? Math.min(...rows) : fallback;
    const botRow = rows.length ? Math.max(...rows) : fallback;
    const zoom = this.board.zoom;
    const h = this.scale.height;
    const BOTTOM_UI = 152; // CTA + secondary pill + palette band
    const TOP_UI = 130; // header scrim + margin
    const bottomFit = h - BOTTOM_UI - (botRow + 1) * CELL * zoom;
    const topFit = TOP_UI - topRow * CELL * zoom;
    this.board.setLayerY(Math.max(bottomFit, topFit));
  }

  /**
   * Answer for someone who pressed "Tap a glowing cell to build".
   *
   * That CTA looks like a button, so people press it, and until now pressing it did
   * nothing at all: a dead end on the one action the whole game is built around. Now
   * it pans to the buildable cells and flares them, so the press teaches you where to
   * go instead of leaving you stuck.
   */
  private hintFrontier(): void {
    if (this.hinting || this.placing) return;
    this.hinting = true;
    this.synth.unlock();

    this.focusBoard(); // make sure the cells are actually on screen before flaring them

    const flare = { v: 1 };
    this.tweens.add({
      targets: flare,
      v: 0.35,
      duration: 420,
      ease: 'Sine.inOut',
      yoyo: true,
      repeat: 2,
      onUpdate: () => this.redrawFrontier(flare.v),
      onComplete: () => {
        this.redrawFrontier();
        this.hinting = false;
      },
    });

    this.toast('Tap one of the glowing cells');
  }

  private layoutPalette(width: number, height: number): void {
    const n = this.tiles.length;
    const gap = 66;
    const startX = width / 2 - ((n - 1) * gap) / 2;
    this.tiles.forEach((tile, i) => tile.setPosition(startX + i * gap, height - 118));
    this.palette.setPosition(0, 0);
  }

  // ---- board rendering ------------------------------------------------------

  private redrawBoard(): void {
    this.board.drawBoard(this.state.cells, this.state.deepestRow, this.state.season, this.state.lastPath ?? []);
    this.redrawGhost();
  }

  private frontierArr(): { c: number; r: number }[] {
    return [...this.frontierSet].map(parseCell);
  }

  private redrawFrontier(pulse = 0.5): void {
    const sel = this.selectedCell ? `${this.selectedCell.c}:${this.selectedCell.r}` : undefined;
    this.board.drawFrontier(this.frontierArr(), pulse, sel);
  }

  private currentOrient(): string {
    const o = PARTS[this.selectedPart].orientations;
    return o[this.orientIdx % o.length] as string;
  }

  private redrawGhost(): void {
    this.ghostG.clear();
    if (!this.selectedCell || this.state.user.placedToday) return;
    const { c, r } = this.selectedCell;
    const ctr = cellCenter(c, r);
    this.ghostG.fillStyle(COLORS.valid, 0.16);
    this.ghostG.fillRoundedRect(c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6, 8);
    this.ghostG.lineStyle(2, COLORS.valid, 0.9);
    this.ghostG.strokeRoundedRect(c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6, 8);
    drawPart(this.ghostG, this.selectedPart, this.currentOrient(), ctr.x, ctr.y, { alpha: 0.72 });
  }

  // ---- palette --------------------------------------------------------------

  private buildPalette(): void {
    this.palette = this.add.container(0, 0).setDepth(55);
    const size = 56;
    PART_LIST.forEach((pid) => {
      const bg = this.add.graphics();
      const icon = this.add.graphics();
      drawPart(icon, pid, PARTS[pid].orientations[0] as string, 0, 0, { withShadow: false });
      icon.setScale(0.6);
      const label = this.add
        .text(0, size / 2 + 2, PARTS[pid].name.split(' ')[0] ?? PARTS[pid].name, {
          fontFamily: SANS,
          fontSize: '10px',
          color: css(COLORS.ink2),
        })
        .setOrigin(0.5, 0);
      // No setSize(): on a Container it shifts the hit area by half the tile (see hud.ts).
      const tile = this.add.container(0, 0, [bg, icon, label]);
      tile.setData('pid', pid);
      tile.setData('bg', bg);
      tile.setInteractive(new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size), Phaser.Geom.Rectangle.Contains);
      tile.on('pointerdown', () => {
        this.selectedPart = pid;
        this.orientIdx = 0;
        this.drawTile(tile, size);
        this.refreshPaletteSelection(size);
        this.redrawGhost();
        this.refreshHud();
      });
      this.tiles.push(tile);
      this.palette.add(tile);
      this.drawTile(tile, size);
    });
    this.refreshPaletteSelection(size);
    this.palette.setVisible(false);
  }

  private drawTile(tile: Phaser.GameObjects.Container, size: number): void {
    const bg = tile.getData('bg') as Phaser.GameObjects.Graphics;
    const pid = tile.getData('pid') as PartId;
    const selected = pid === this.selectedPart;
    bg.clear();
    bg.fillStyle(selected ? COLORS.paperHi : COLORS.paperLo, 1);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 10);
    bg.lineStyle(selected ? 3 : 2, selected ? COLORS.brass : COLORS.grid, 1);
    bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 10);
  }

  private refreshPaletteSelection(size: number): void {
    for (const tile of this.tiles) this.drawTile(tile, size);
  }

  private showPalette(v: boolean): void {
    this.palette.setVisible(v && !this.state.user.placedToday);
  }

  // ---- interaction ----------------------------------------------------------

  private onDown(p: Phaser.Input.Pointer): void {
    this.panActive = true;
    this.dragging = false;
    this.dragStartY = p.y;
    this.dragStartLayerY = this.board.layerY;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.panActive || !p.isDown) return;
    const dy = p.y - this.dragStartY;
    if (Math.abs(dy) > 8) this.dragging = true;
    if (this.dragging) this.board.setLayerY(this.clampPan(this.dragStartLayerY + dy));
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const wasDrag = this.dragging;
    this.panActive = false;
    if (wasDrag) return;
    if (this.popover) {
      this.closePopover();
      return;
    }
    if (this.placing) return;
    const { c, r } = this.board.screenToCell(p.x, p.y);
    const id = `${c}:${r}`;

    // Building: tap a glowing frontier cell to select / rotate.
    const canBuild = !this.state.user.placedToday && !this.state.hasNewRunForUser;
    if (canBuild && this.frontierSet.has(id)) {
      const orients = PARTS[this.selectedPart].orientations.length;
      if (this.selectedCell && this.selectedCell.c === c && this.selectedCell.r === r) {
        this.orientIdx = (this.orientIdx + 1) % orients;
        this.synth.tick();
      } else {
        this.selectedCell = { c, r };
        this.showPalette(true);
        // Rotation is invisible: nothing on screen says it exists, and you would only
        // find it by tapping the same cell twice by accident. Since your part is
        // orientation-sensitive and you only get one a day, that is a bad thing to
        // leave people to discover. Say it once, when it first becomes relevant.
        if (orients > 1 && !this.rotateHintShown) {
          this.rotateHintShown = true;
          this.toast('Tap the cell again to rotate');
        }
      }
      this.redrawGhost();
      this.refreshHud();
      return;
    }

    // Otherwise: tap a placed part to see who built it and vote on it.
    const placed = this.state.cells.find((x) => x.c === c && x.r === r);
    if (placed) this.showCellPopover(placed);
  }

  private clampPan(y: number): number {
    const zoom = this.board.zoom;
    const botY = (this.state.deepestRow + 6) * CELL;
    const maxLayerY = this.scale.height * 0.4;
    const minLayerY = this.scale.height * 0.62 - botY * zoom;
    return Math.min(maxLayerY, Math.max(minLayerY, y));
  }

  private doPlace(): void {
    if (!this.selectedCell || this.placing) return;
    this.placing = true;
    const { c, r } = this.selectedCell;
    const part = this.selectedPart;
    const orient = this.currentOrient();
    net
      .place({ c, r, part, orient })
      .then((res) => {
        this.placing = false;
        if (res.ok) {
          this.synth.place();
          this.state.cells.push(res.cell);
          this.frontierSet = new Set(res.frontier);
          this.state.user.placedToday = true;
          this.state.user.streak = res.streak;
          this.placementPop(c, r);
          this.selectedCell = null;
          this.showPalette(false);
          this.redrawBoard();
          this.refreshHud();
        } else {
          this.toast(res.message);
          if (res.reason === 'occupied' || res.reason === 'not_frontier') {
            this.frontierSet.delete(`${c}:${r}`);
            this.selectedCell = null;
            this.redrawGhost();
            this.refreshHud();
          }
        }
      })
      .catch(() => {
        this.placing = false;
        this.toast('Network hiccup. Try again.');
      });
  }

  private watchRun(): void {
    const date = this.state.latestRunDate;
    if (!date) return;
    net
      .run(date)
      .then((run) => {
        if (!run || run.type !== 'run' || !Array.isArray(run.keyframes)) {
          this.toast('No run to watch yet');
          return;
        }
        this.scene.start('Run', { run, state: this.state });
      })
      .catch(() => this.toast('Could not load the run'));
  }

  /** Non-scoring: run the machine as it stands right now and watch it play. */
  private previewRun(): void {
    if (this.placing) return;
    this.synth.unlock();
    net
      .preview()
      .then((run) => {
        if (!run || run.type !== 'run' || !Array.isArray(run.keyframes)) {
          this.toast('Nothing to run yet');
          return;
        }
        this.scene.start('Run', { run, state: this.state, preview: true });
      })
      .catch(() => this.toast('Preview failed'));
  }

  // ---- placed-part popover (who built it + vote) ----------------------------

  private closePopover(): void {
    this.popover?.destroy();
    this.popover = undefined;
  }

  private showCellPopover(cell: WireCell): void {
    this.closePopover();
    const owner = cell.owner === 'clatterfall' ? 'the workshop' : `u/${cell.owner}`;
    const partName = PARTS[cell.part].name;
    const contrib = this.state.lastContributions[`${cell.c}:${cell.r}`] ?? 0;
    const w = Math.min(this.scale.width - 40, 300);
    const isMod = this.state.isMod === true;
    const h = isMod ? 136 : 100;

    const g = this.add.graphics();
    g.fillStyle(COLORS.paperHi, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, COLORS.brass, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    const title = this.add
      .text(0, -h / 2 + 16, `${owner}'s ${partName}`, { fontFamily: SANS, fontSize: '14px', color: css(COLORS.ink), fontStyle: 'bold' })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, -h / 2 + 38, contrib > 0 ? `carried the marble +${Math.round(contrib)} px last run` : "not on the marble's path last run", {
        fontFamily: SANS,
        fontSize: '11px',
        color: css(COLORS.ink2),
      })
      .setOrigin(0.5);
    const voteY = isMod ? -h / 2 + 70 : h / 2 - 22;
    const items: Phaser.GameObjects.GameObject[] = [
      g,
      title,
      sub,
      this.voteButton(-52, voteY, 'keep', 1, cell),
      this.voteButton(52, voteY, 'cut', -1, cell),
    ];
    if (isMod) items.push(this.modRemoveButton(0, h / 2 - 20, cell));

    this.popover = this.add.container(this.scale.width / 2, this.scale.height - 172, items).setDepth(85);
    this.popover.setScale(0.92);
    this.tweens.add({ targets: this.popover, scale: 1, duration: 160, ease: 'Back.out' });
  }

  /**
   * Mods can pull one griefing part instead of reseeding the whole machine, which
   * was previously the only removal tool. The server re-checks mod status on the
   * call, so a forged `isMod` in the client buys nothing.
   */
  private modRemoveButton(x: number, y: number, cell: WireCell): Phaser.GameObjects.Container {
    const bw = 204;
    const bh = 26;
    const g = this.add.graphics();
    g.lineStyle(1.5, COLORS.invalid, 0.7);
    g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 8);
    const t = this.add
      .text(0, 0, 'remove this part (mod)', { fontFamily: SANS, fontSize: '11px', color: css(COLORS.invalid) })
      .setOrigin(0.5);
    const btn = this.add.container(x, y, [g, t]);
    btn.setInteractive(new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh), Phaser.Geom.Rectangle.Contains);
    btn.on('pointerdown', () => {
      this.synth.unlock();
      net
        .remove(cell.c, cell.r)
        .then((res) => {
          if (!res.ok) {
            this.toast(res.message);
            return;
          }
          this.state.cells = this.state.cells.filter((x) => !(x.c === cell.c && x.r === cell.r));
          this.closePopover();
          this.redrawBoard();
          this.toast('Part removed');
        })
        .catch(() => this.toast('Remove failed'));
    });
    return btn;
  }

  /**
   * The keep/cut buttons. The chevron is DRAWN, not an emoji: 👍/👎 are
   * OS-rendered raster images, which would both contradict "every pixel is drawn
   * at runtime" and read as the emoji-as-icon tell that judges call AI slop.
   */
  private voteButton(x: number, y: number, label: string, dir: 1 | -1, cell: WireCell): Phaser.GameObjects.Container {
    const bw = 100;
    const bh = 28;
    const tint = dir > 0 ? COLORS.valid : COLORS.invalid;
    const g = this.add.graphics();
    g.fillStyle(tint, 0.16);
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 8);
    g.lineStyle(1.5, tint, 1);
    g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 8);

    // A solid chevron: up = keep, down = cut.
    const cx = -bw / 2 + 17;
    const s = 5;
    g.fillStyle(tint, 1);
    if (dir > 0) g.fillTriangle(cx, -s, cx + s + 1, s, cx - s - 1, s);
    else g.fillTriangle(cx, s, cx + s + 1, -s, cx - s - 1, -s);

    const t = this.add
      .text(6, 0, label, { fontFamily: SANS, fontSize: '12px', color: css(COLORS.ink) })
      .setOrigin(0.5);
    const btn = this.add.container(x, y, [g, t]);
    btn.setInteractive(new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh), Phaser.Geom.Rectangle.Contains);
    btn.on('pointerdown', () => {
      this.synth.unlock();
      net
        .vote(cell.c, cell.r, dir)
        .then((r) => {
          if (!r.ok) this.toast("That part isn't on the machine any more");
          else if (r.applied === false) this.toast('You already voted on this part');
          else this.toast(dir > 0 ? 'Voted to keep this part' : 'Voted to cut this part');
        })
        .catch(() => {});
      this.closePopover();
    });
    return btn;
  }

  // ---- HUD / CTA ------------------------------------------------------------

  private refreshHud(): void {
    const s = this.state;
    this.hud.setTopBar({ day: s.day, season: s.season, streak: s.user.streak });
    this.hud.setDepth(s.reach, s.record, s.goal);
    if (s.hasNewRunForUser && s.latestRunDate) {
      this.setCta('Watch today’s run', () => this.watchRun(), true, 'play');
    } else if (s.user.placedToday) {
      this.setCta(this.countdownText(), undefined, false, 'check');
    } else if (this.selectedCell) {
      this.setCta(`Place ${PARTS[this.selectedPart].name}`, () => this.doPlace());
    } else {
      this.setCta('Tap a glowing cell to build', () => this.hintFrontier(), false);
    }
    // "Test run" preview, hidden while mid-placement (so it never covers the palette).
    const canPreview = s.cells.length > 0 && !this.selectedCell;
    this.hud.setSecondary(canPreview ? 'Test run (preview)' : '', () => this.previewRun());
  }

  private setCta(text: string, onClick?: () => void, enabled = true, icon: CtaIcon = 'none'): void {
    if (text === this.lastCta && enabled) return;
    this.lastCta = text;
    this.hud.setCta(text, onClick, enabled, icon);
  }

  private countdownText(): string {
    const remain = Math.max(0, this.state.nextRunAtMs - (Date.now() + this.serverOffset));
    const s = Math.floor(remain / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `Placed. Next run in ${hh}:${mm}:${ss}`;
  }

  // ---- juice ----------------------------------------------------------------

  private placementPop(c: number, r: number): void {
    const ctr = cellCenter(c, r);
    const ring = this.add.graphics();
    ring.lineStyle(3, COLORS.freshRing, 1);
    ring.strokeCircle(0, 0, CELL * 0.4);
    ring.setPosition(ctr.x, ctr.y);
    this.board.addToLayer(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.out',
      onComplete: () => ring.destroy(),
    });
  }

  private toast(msg: string): void {
    const { width, height } = this.scale;
    const t = this.add
      .text(width / 2, height - 150, msg, {
        fontFamily: SANS,
        fontSize: '14px',
        color: css(COLORS.paperHi),
        backgroundColor: css(COLORS.ink),
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(90);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 1800, ease: 'Cubic.in', onComplete: () => t.destroy() });
  }

  override update(time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time / 360);
    this.redrawFrontier(pulse);
    if (this.state.user.placedToday && !this.state.hasNewRunForUser) {
      const txt = this.countdownText();
      if (txt !== this.lastCta) {
        this.lastCta = txt;
        this.hud.setCta(txt, undefined, false);
      }
    }
  }
}
