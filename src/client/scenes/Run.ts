import { Scene } from 'phaser';
import type Phaser from 'phaser';
import type { RunResponse, StateResponse } from '../../shared/api';
import type { CollisionEvent, Keyframe } from '../../shared/types';
import { CELL, MARBLE_RADIUS, WORLD_WIDTH } from '../../shared/constants';
import { cellCenter, parseCell } from '../../shared/geometry';
import { COLORS } from '../../shared/theme';
import { BoardView } from '../render/board';
import { Hud } from '../render/hud';
import { drawMarble } from '../render/draw';
import type { Synth } from '../audio/synth';
import { net } from '../net';

type InitData = { run: RunResponse; state: StateResponse; preview?: boolean };

export class Run extends Scene {
  private run!: RunResponse;
  private state!: StateResponse;
  private board!: BoardView;
  private hud!: Hud;
  private synth!: Synth;
  private marbleG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private recordLineG: Phaser.GameObjects.Graphics | undefined;

  private kfs: Keyframe[] = [];
  private evts: CollisionEvent[] = [];
  private totalT = 1;
  private playDuration = 6000;
  private elapsed = 0;
  private kfi = 0;
  private evi = 0;
  private maxDepthSeen = 0;
  private recordBroken = false;
  private finished = false;
  private reduced = false;
  private preview = false;
  private trail: { x: number; y: number }[] = [];

  /** How far above the record the run starts playing in slow motion. */
  private static readonly DRAMA_WINDOW = CELL * 2.4;

  constructor() {
    super('Run');
  }

  /** Scenes are singletons, so reset all replay state on each (re)entry. */
  init(): void {
    this.recordLineG = undefined;
    this.kfs = [];
    this.evts = [];
    this.totalT = 1;
    this.playDuration = 6000;
    this.elapsed = 0;
    this.kfi = 0;
    this.evi = 0;
    this.maxDepthSeen = 0;
    this.recordBroken = false;
    this.finished = false;
    this.trail = [];
  }

  create(data: InitData): void {
    this.run = data.run;
    this.state = data.state;
    this.preview = data.preview ?? false;
    this.synth = this.registry.get('synth') as Synth;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.cameras.main.setBackgroundColor(COLORS.paper);
    // The very first run auto-plays without a tap, so the AudioContext may still
    // be suspended. Resume it on any tap during the run.
    this.input.on('pointerdown', () => this.synth.unlock());

    const kf = Array.isArray(this.run.keyframes) ? this.run.keyframes : [];
    this.kfs = kf.length ? kf : [{ t: 0, x: CELL * 3.5, y: 0, rot: 0, vx: 0, vy: 0, touch: '' }];
    this.evts = Array.isArray(this.run.events) ? [...this.run.events].sort((a, b) => a.t - b.t) : [];
    this.totalT = Math.max(1, this.kfs[this.kfs.length - 1]?.t ?? 1);
    this.playDuration = Math.min(6000, Math.max(3000, this.totalT));

    this.board = new BoardView(this);
    this.board.drawBoard(this.run.cells, deepestOf(this.run.cells), this.run.season);
    this.drawRecordLine();
    this.fxG = this.add.graphics();
    this.marbleG = this.add.graphics();
    this.board.addToLayer(this.fxG);
    this.board.addToLayer(this.marbleG);

    this.hud = new Hud(this);
    this.hud.setTopBar({ day: this.run.day, season: this.run.season, streak: this.state.user.streak });
    this.hud.setDepth(0, this.run.prevRecord, this.run.goal);

    this.layout();
    const onResize = (): void => this.layout();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    // A breath, then wind up and drop.
    const first = this.kfs[0] as Keyframe;
    this.board.setFocus(first.y, 0.4);
    this.synth.windUp();
    this.time.delayedCall(this.reduced ? 100 : 650, () => {
      this.elapsed = 0.0001;
    });
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.board.resize(width, height);
    this.hud.layout(width, height, this.board.rightEdge);
  }

  private sample(t: number): Keyframe {
    while (this.kfi < this.kfs.length - 2 && (this.kfs[this.kfi + 1] as Keyframe).t <= t) this.kfi++;
    const a = this.kfs[this.kfi] as Keyframe;
    const b = this.kfs[Math.min(this.kfi + 1, this.kfs.length - 1)] as Keyframe;
    const span = b.t - a.t;
    const f = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - a.t) / span));
    return {
      t,
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      rot: 0,
      vx: 0,
      vy: 0,
      touch: b.touch,
    };
  }

  private fireEventsUpTo(t: number): void {
    while (this.evi < this.evts.length && (this.evts[this.evi] as CollisionEvent).t <= t) {
      const e = this.evts[this.evi] as CollisionEvent;
      this.evi++;
      this.synth.hit(e.material, e.v);
      this.flashCell(e.cell);
    }
  }

  /** Impact: a bold brass shock-ring plus a burst of sawdust sparks. */
  private flashCell(cellId: string): void {
    if (this.reduced) return;
    const { c, r } = parseCell(cellId);
    const ctr = cellCenter(c, r);

    const ring = this.add.graphics();
    ring.lineStyle(6, COLORS.brassHi, 1);
    ring.strokeCircle(0, 0, CELL * 0.3);
    ring.setPosition(ctr.x, ctr.y);
    this.board.addToLayer(ring);
    this.tweens.add({ targets: ring, scale: 2.1, alpha: 0, duration: 460, ease: 'Cubic.out', onComplete: () => ring.destroy() });

    // Sawdust sparks kicked off the strike point.
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (1.15 + Math.random() * 0.7); // fan upward-ish
      const dist = 22 + Math.random() * 26;
      const spark = this.add.graphics();
      spark.fillStyle(i % 2 ? COLORS.brassHi : COLORS.woodHi, 1);
      spark.fillCircle(0, 0, 3 + Math.random() * 2);
      spark.setPosition(ctr.x, ctr.y);
      this.board.addToLayer(spark);
      this.tweens.add({
        targets: spark,
        x: ctr.x + Math.cos(a) * dist,
        y: ctr.y + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 380 + Math.random() * 220,
        ease: 'Cubic.out',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /**
   * The line to beat, drawn across the shaft at the depth the machine reached on
   * its best day. Without it the record is just a number in the corner and the
   * closing seconds of the run read as "the marble stopped". With it, you can see
   * him running out of machine.
   */
  private drawRecordLine(): void {
    const rec = this.run.prevRecord;
    if (rec <= 0) return;
    const g = this.add.graphics();
    g.lineStyle(3, COLORS.pip, 0.55);
    for (let x = 4; x < WORLD_WIDTH - 4; x += 22) {
      g.lineBetween(x, rec, Math.min(x + 12, WORLD_WIDTH - 4), rec);
    }
    g.fillStyle(COLORS.pip, 0.75);
    g.fillTriangle(0, rec - 7, 9, rec, 0, rec + 7);
    this.board.addToLayer(g); // added before fx + marble, so Pip crosses over it
    this.recordLineG = g;
  }

  /**
   * How close Pip is to the line, 0 (nowhere near) to 1 (right on it). This is the
   * dramatic clock of the whole game: it dilates time and leans the camera in as he
   * closes on the record, so the moment the community is waiting for actually plays
   * like a moment instead of scrolling past at constant speed.
   */
  private tension(y: number): number {
    const rec = this.run.prevRecord;
    if (this.reduced || rec <= 0 || this.recordBroken) return 0;
    const togo = rec - y;
    if (togo < 0 || togo > Run.DRAMA_WINDOW) return 0;
    return 1 - togo / Run.DRAMA_WINDOW;
  }

  private drawMarbleAt(x: number, y: number): void {
    const g = this.marbleG;
    g.clear();
    if (!this.reduced) {
      this.trail.push({ x, y });
      if (this.trail.length > 10) this.trail.shift();
      this.trail.forEach((p, i) => {
        const f = i / this.trail.length;
        g.fillStyle(COLORS.pip, f * 0.5);
        g.fillCircle(p.x, p.y, MARBLE_RADIUS * (0.55 + 0.45 * f));
      });
    }
    drawMarble(g, x, y, MARBLE_RADIUS);
  }

  private onRecordBreak(): void {
    if (this.recordBroken) return;
    this.recordBroken = true;
    if (!this.reduced) this.cameras.main.shake(220, 0.008);
    // The line he just beat snaps and falls away.
    const line = this.recordLineG;
    if (line && !this.reduced) {
      this.tweens.add({
        targets: line,
        alpha: 0,
        y: line.y + 26,
        duration: 520,
        ease: 'Cubic.in',
        onComplete: () => line.destroy(),
      });
      this.recordLineG = undefined;
    }
    const flash = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, COLORS.paperHi, 0.5).setDepth(70);
    this.tweens.add({ targets: flash, alpha: 0, duration: 320, onComplete: () => flash.destroy() });
    this.synth.record();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const last = this.kfs[this.kfs.length - 1] as Keyframe;
    this.drawMarbleAt(last.x, last.y);
    this.hud.countTo(this.run.reach, 900);
    this.hud.setDepth(this.run.reach, this.run.record, this.run.goal);

    // Settle the camera so Pip ends up low in the frame with the machine he just
    // threaded filling the space above him. Holding him at mid-height left the
    // bottom half of the final frame as dead grid, which made the payoff shot the
    // emptiest shot in the whole run.
    const anchor = { v: 0.48 };
    this.tweens.add({
      targets: anchor,
      v: 0.74,
      duration: 700,
      ease: 'Cubic.inOut',
      onUpdate: () => this.board.setFocus(last.y, anchor.v),
    });

    if (this.preview) this.synth.milestone();
    else if (this.run.state === 'goal') this.synth.goal();
    else if (this.run.state === 'record') this.synth.record();
    // A jam is a soft wooden thud, not the rising chime you get for a good run. The
    // marble stopped where it should not have, and the sound should say so.
    else if (this.run.state === 'jammed') this.synth.hit('wood', 5);
    else this.synth.milestone();

    if (!this.preview && (this.run.state === 'record' || this.run.state === 'goal')) this.confetti();

    let yourPx = 0;
    const contrib = this.run.contributions ?? {};
    for (const id of this.state.user.yourCells ?? []) yourPx += contrib[id] ?? 0;

    this.time.delayedCall(900, () => {
      this.hud.showResult(
        this.run.state,
        this.run.reach,
        this.run.record,
        yourPx,
        () => this.done(),
        this.preview,
        this.run.topContributors ?? [],
        this.run.dissolved ?? 0,
        this.run.jammedOwner ?? '',
        this.state.user.username
      );
    });
  }

  private confetti(): void {
    if (this.reduced) return;
    const cols = [COLORS.brassHi, COLORS.pip, COLORS.goalReady, COLORS.brass];
    for (let i = 0; i < 26; i++) {
      const x = this.scale.width * (0.2 + 0.6 * Math.random());
      const p = this.add.rectangle(x, this.scale.height * 0.35, 6, 10, cols[i % cols.length]).setDepth(75);
      this.tweens.add({
        targets: p,
        y: this.scale.height + 20,
        x: x + (Math.random() - 0.5) * 120,
        angle: Math.random() * 360,
        duration: 1400 + Math.random() * 900,
        ease: 'Cubic.in',
        onComplete: () => p.destroy(),
      });
    }
  }

  private done(): void {
    if (this.preview) {
      // A preview is non-scoring: return to Build unchanged (don't mark watched).
      this.scene.start('Build', { state: this.state });
      return;
    }
    const back: StateResponse = {
      ...this.state,
      hasNewRunForUser: false,
      reach: this.run.reach,
      record: this.run.record,
    };
    net.watched(this.run.date).catch(() => {});
    this.scene.start('Build', { state: back });
  }

  override update(_time: number, delta: number): void {
    if (this.finished || this.elapsed === 0) return;

    // Dilate time and lean the camera in as Pip closes on the record. Playback is
    // the only thing that slows: the simulation already happened on the server and
    // is immutable, so this changes how the run FEELS, never what it says.
    const k = this.tension(this.maxDepthSeen);
    this.elapsed += delta * (1 - 0.62 * k);

    const progress = Math.min(1, this.elapsed / this.playDuration);
    const simT = progress * this.totalT;
    const kf = this.sample(simT);
    this.fireEventsUpTo(simT);
    this.drawMarbleAt(kf.x, kf.y);
    this.board.setFocus(kf.y, 0.48 - 0.11 * k);

    if (kf.y > this.maxDepthSeen) this.maxDepthSeen = kf.y;

    /**
     * Show the CARRIED depth, capped at the run's reach.
     *
     * The marble physically keeps falling past the machine to the catch floor, six
     * rows below the deepest part, but the machine gets no credit for that (see the
     * note on `reach` in the sim). Reporting the raw depth meant the counter climbed
     * past the score and then visibly ticked BACKWARDS when the run settled: on the
     * seed it ran up to 2,051 and then counted down to 1,685, on every single run.
     * Now it climbs to the score and stops there, which is also the honest number.
     */
    const carried = Math.min(this.maxDepthSeen, this.run.reach);
    this.hud.setDepth(Math.round(carried), this.run.prevRecord, this.run.goal);

    if (
      !this.preview &&
      !this.recordBroken &&
      (this.run.state === 'record' || this.run.state === 'goal') &&
      carried > this.run.prevRecord
    ) {
      this.onRecordBreak();
    }

    // The marble is now falling out of the bottom of the machine, so the record line
    // is behind it in a way that does not count. Fade it, or he appears to sail
    // straight through the record on a day he did not actually beat it.
    if (this.recordLineG && !this.recordBroken && this.maxDepthSeen > this.run.reach) {
      this.recordLineG.setAlpha(0.18);
    }

    if (progress >= 1) this.finish();
  }
}

function deepestOf(cells: { r: number }[]): number {
  return cells.reduce((m, c) => Math.max(m, c.r), 0);
}
