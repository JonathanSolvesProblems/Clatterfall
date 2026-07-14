/**
 * Screen-fixed instrument HUD: the DAY counter, streak, the brass depth ruler
 * with its vermilion record-pin, the context CTA button, and the run result
 * card. All Phaser primitives + system font stacks (warm serif for headers,
 * mono for the gauge readouts). No bundled fonts.
 */
import * as Phaser from 'phaser';
import type { CliffhangerState, Contributor } from '../../shared/types';
import { COLORS, css } from '../../shared/theme';
import { MONO, SANS, SERIF } from './fonts';

/** Drawn CTA icons. Never a text glyph: those render from the OS font. */
export type CtaIcon = 'none' | 'play' | 'check';

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

type TopBar = { day: number; season: number; streak: number };

export class Hud {
  private readonly scene: Phaser.Scene;
  private day: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private streak: Phaser.GameObjects.Text;
  private streakFlame: Phaser.GameObjects.Graphics;
  private topScrim: Phaser.GameObjects.Graphics;
  private depthNum: Phaser.GameObjects.Text;
  private recordText: Phaser.GameObjects.Text;
  private ruler: Phaser.GameObjects.Graphics;
  private ctaBg: Phaser.GameObjects.Graphics;
  private ctaText: Phaser.GameObjects.Text;
  private cta: Phaser.GameObjects.Container;
  private secBg: Phaser.GameObjects.Graphics;
  private secText: Phaser.GameObjects.Text;
  private sec: Phaser.GameObjects.Container;
  private resultCard: Phaser.GameObjects.Container | undefined;

  private w = 0;
  private h = 0;
  private reach = 0;
  private record = 0;
  private goal = 1;
  private onCta: (() => void) | undefined = undefined;
  private ctaIcon: CtaIcon = 'none';
  private ctaEnabled = true;
  private onSec: (() => void) | undefined = undefined;
  private hasStreak = false;
  private rulerX = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const s = scene;
    this.topScrim = s.add.graphics().setDepth(45);
    this.day = s.add.text(16, 12, 'DAY 1', { fontFamily: MONO, fontSize: '16px', color: css(COLORS.ink) }).setDepth(50);
    this.title = s.add
      .text(0, 14, 'CLATTERFALL', { fontFamily: SERIF, fontSize: '15px', color: css(COLORS.brassDark) })
      .setDepth(50)
      .setOrigin(0.5, 0);
    this.streak = s.add
      .text(0, 12, '', { fontFamily: MONO, fontSize: '16px', color: css(COLORS.pipRim) })
      .setDepth(50)
      .setOrigin(1, 0);
    this.streakFlame = s.add.graphics().setDepth(50);
    this.depthNum = s.add.text(16, 38, '0', { fontFamily: MONO, fontSize: '34px', color: css(COLORS.ink) }).setDepth(50);
    s.add.text(18, 76, 'px deep', { fontFamily: SANS, fontSize: '12px', color: css(COLORS.ink2) }).setDepth(50);
    // Walnut, not vermilion: Pip is the ONLY thing on screen allowed to be red.
    this.recordText = s.add.text(16, 94, 'record 0', { fontFamily: MONO, fontSize: '13px', color: css(COLORS.woodLo) }).setDepth(50);
    this.ruler = s.add.graphics().setDepth(48);

    this.ctaBg = s.add.graphics();
    this.ctaText = s.add
      .text(0, 0, '', { fontFamily: SANS, fontSize: '18px', color: css(COLORS.paperHi), fontStyle: 'bold' })
      .setOrigin(0.5);
    this.cta = s.add.container(0, 0, [this.ctaBg, this.ctaText]).setDepth(60).setVisible(false);
    this.cta.on('pointerdown', () => this.onCta?.());

    this.secBg = s.add.graphics();
    this.secText = s.add
      .text(0, 0, '', { fontFamily: SANS, fontSize: '14px', color: css(COLORS.brassDark), fontStyle: 'bold' })
      .setOrigin(0.5);
    this.sec = s.add.container(0, 0, [this.secBg, this.secText]).setDepth(59).setVisible(false);
    this.sec.on('pointerdown', () => this.onSec?.());
  }

  /**
   * `boardRight` is the screen x of the board's right rail. The ruler docks to it
   * rather than to the viewport edge, otherwise on a wide desktop the gauge
   * floats hundreds of pixels away from the thing it is measuring.
   */
  layout(w: number, h: number, boardRight?: number): void {
    this.w = w;
    this.h = h;
    this.rulerX = (boardRight ?? w - 22) + 22;
    // Fully opaque: at 0.93 the machine's parts ghosted through into the header.
    this.topScrim.clear();
    this.topScrim.fillStyle(COLORS.paper, 1);
    this.topScrim.fillRect(0, 0, w, 118);
    this.topScrim.lineStyle(1, COLORS.brass, 0.4);
    this.topScrim.lineBetween(0, 118, w, 118);
    this.title.setX(w / 2);
    this.streak.setX(w - 16);
    this.drawStreakFlame(this.hasStreak); // width is only known here, so redraw
    this.drawRuler();
    this.positionCta();
    this.positionSecondary();
    if (this.resultCard) this.resultCard.setPosition(w / 2, h - 150);
  }

  setTopBar(d: TopBar): void {
    this.day.setText(`DAY ${d.day}`);
    this.title.setText(d.season > 1 ? `CLATTERFALL · S${d.season}` : 'CLATTERFALL');
    this.streak.setText(d.streak > 0 ? `${d.streak}` : '');
    this.hasStreak = d.streak > 0;
    this.drawStreakFlame(this.hasStreak);
  }

  /**
   * The streak flame, drawn from primitives. It used to be a 🔥 emoji, which is
   * an OS-rendered raster image and would have quietly contradicted the whole
   * "every pixel is drawn at runtime, no images anywhere" claim.
   */
  private drawStreakFlame(show: boolean): void {
    const g = this.streakFlame;
    g.clear();
    if (!show) return;
    const x = this.w - 44;
    const y = 22;
    g.fillStyle(COLORS.pipRim, 1);
    g.beginPath();
    g.moveTo(x, y - 11); // tip
    g.lineTo(x + 6, y - 1);
    g.lineTo(x + 4, y + 8);
    g.lineTo(x - 4, y + 8);
    g.lineTo(x - 6, y - 1);
    g.closePath();
    g.fillPath();
    g.fillStyle(COLORS.pip, 1);
    g.beginPath();
    g.moveTo(x + 1, y - 5);
    g.lineTo(x + 4, y + 1);
    g.lineTo(x + 2, y + 7);
    g.lineTo(x - 3, y + 7);
    g.lineTo(x - 4, y + 1);
    g.closePath();
    g.fillPath();
    g.fillStyle(COLORS.pipSpec, 0.9);
    g.fillCircle(x - 0.5, y + 4, 2.2);
  }

  setDepth(reach: number, record: number, goal: number): void {
    this.reach = reach;
    this.record = record;
    this.goal = Math.max(goal, 1);
    this.depthNum.setText(fmt(reach));
    this.recordText.setText(`record ${fmt(record)}`);
    this.drawRuler();
  }

  /** Animate the big depth number + ruler counting up to `to`. */
  countTo(to: number, ms = 900): void {
    const obj = { v: this.reach };
    this.scene.tweens.add({
      targets: obj,
      v: to,
      duration: ms,
      ease: 'Cubic.out',
      onUpdate: () => {
        this.reach = obj.v;
        this.depthNum.setText(fmt(obj.v));
        this.drawRuler();
      },
    });
  }

  private drawRuler(): void {
    const g = this.ruler;
    g.clear();
    const x = Math.min(this.rulerX || this.w - 22, this.w - 14);
    const top = 126; // below the 118px header scrim, so the gauge never bleeds up
    const bottom = this.h - 120;
    const trackH = Math.max(bottom - top, 40);
    g.fillStyle(COLORS.paperLo, 1);
    g.fillRoundedRect(x - 6, top, 12, trackH, 6);
    g.lineStyle(1, COLORS.brass, 0.5);
    g.strokeRoundedRect(x - 6, top, 12, trackH, 6);
    g.lineStyle(1, COLORS.brass, 0.35);
    for (let i = 0; i <= 10; i++) {
      const ty = top + (trackH * i) / 10;
      g.lineBetween(x - 10, ty, x - 6, ty);
    }
    const frac = (v: number): number => top + trackH * Math.min(1, v / this.goal);
    const fy = frac(this.reach);
    g.fillStyle(COLORS.brassHi, 0.9);
    g.fillRoundedRect(x - 5, top, 10, Math.max(0, fy - top), 5);
    g.fillStyle(COLORS.goalReady, 1);
    g.fillTriangle(x - 12, bottom, x - 4, bottom - 6, x - 4, bottom + 6);
    const ry = frac(this.record);
    g.fillStyle(COLORS.recordPin, 1);
    g.fillTriangle(x + 6, ry, x + 16, ry - 6, x + 16, ry + 6);
    g.lineStyle(2, COLORS.recordPin, 0.8);
    g.lineBetween(x - 6, ry, x + 6, ry);
  }

  private positionCta(): void {
    const cx = this.w / 2;
    const cy = this.h - 42;
    const bw = Math.min(this.w - 40, 320);
    const bh = 52;
    this.ctaBg.clear();
    if (this.ctaText.text) {
      this.ctaBg.fillStyle(COLORS.brass, 1);
      this.ctaBg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
      this.ctaBg.fillStyle(COLORS.brassHi, 1);
      this.ctaBg.fillRoundedRect(-bw / 2, -bh / 2, bw, 4, 2);
    }

    // Icons are drawn, never "▶" / "✓" glyphs. Text glyphs render from the OS font
    // and are the same class of tell as an emoji icon, and the whole game is
    // otherwise drawn from primitives.
    const icon = this.ctaText.text ? this.ctaIcon : 'none';
    this.ctaText.setX(icon === 'none' ? 0 : 11);
    if (icon !== 'none') {
      const tint = this.ctaEnabled ? COLORS.paperHi : COLORS.ink;
      const bx = 11 - this.ctaText.width / 2 - 17;
      if (icon === 'play') {
        this.ctaBg.fillStyle(tint, 1);
        this.ctaBg.fillTriangle(bx, -7, bx, 7, bx + 11, 0);
      } else {
        this.ctaBg.lineStyle(2.5, tint, 1);
        this.ctaBg.beginPath();
        this.ctaBg.moveTo(bx, 0);
        this.ctaBg.lineTo(bx + 4, 5);
        this.ctaBg.lineTo(bx + 12, -6);
        this.ctaBg.strokePath();
      }
    }

    // An empty CTA still drew nothing but stayed interactive, so in the Run scene it
    // was an invisible button sitting over the bottom of the result card, eating taps.
    this.cta.setVisible(!!this.ctaText.text);
    this.cta.setPosition(cx, cy);
    this.cta.setInteractive(
      new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh),
      Phaser.Geom.Rectangle.Contains
    );
  }

  setCta(text: string, onClick?: () => void, enabled = true, icon: CtaIcon = 'none'): void {
    this.ctaIcon = icon;
    this.ctaEnabled = enabled;
    this.ctaText.setText(text);
    // The non-clickable states here are coaching ("Tap a glowing cell") and the
    // countdown, both must stay readable, so use ink rather than disabled grey.
    this.ctaText.setColor(enabled ? css(COLORS.paperHi) : css(COLORS.ink));
    this.onCta = enabled ? onClick : undefined;
    this.positionCta();
  }

  private positionSecondary(): void {
    const cx = this.w / 2;
    const cy = this.h - 96;
    const bw = Math.min(this.w - 90, 210);
    const bh = 34;
    this.secBg.clear();
    if (this.secText.text) {
      this.secBg.fillStyle(COLORS.paperHi, 1);
      this.secBg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
      this.secBg.lineStyle(2, COLORS.brass, 1);
      this.secBg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
    }
    this.sec.setPosition(cx, cy);
    this.sec.setInteractive(new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh), Phaser.Geom.Rectangle.Contains);
  }

  setSecondary(text: string, onClick?: () => void): void {
    this.secText.setText(text);
    this.onSec = onClick;
    this.sec.setVisible(!!text);
    this.positionSecondary();
  }

  showResult(
    state: CliffhangerState,
    reach: number,
    record: number,
    yourPx: number,
    onClose: () => void,
    preview = false,
    contributors: Contributor[] = [],
    dissolved = 0
  ): void {
    this.resultCard?.destroy();
    const s = this.scene;
    const width = Math.min(this.w - 32, 360);

    // Name the redditors whose parts actually carried the marble today. The credits
    // sum exactly to the reach, so these numbers are literal, not a popularity score.
    const rows = contributors.slice(0, 3);
    const dissolveLine = !preview && dissolved > 0;
    const extra = (rows.length ? 30 + rows.length * 19 : 0) + (dissolveLine ? 20 : 0);
    const height = 150 + extra;
    const top = -height / 2;

    const g = s.add.graphics();
    g.fillStyle(COLORS.paperHi, 1);
    g.fillRoundedRect(-width / 2, top, width, height, 18);
    g.lineStyle(3, COLORS.brass, 1);
    g.strokeRoundedRect(-width / 2, top, width, height, 18);

    const head = preview ? { title: 'Preview run', color: COLORS.brassDark } : RESULT_HEAD[state];
    const subText = preview
      ? "the real run is tomorrow, with everyone's parts"
      : yourPx > 0
        ? `your part carried it +${fmt(yourPx)} px`
        : `record ${fmt(record)} px`;
    const headText = s.add
      .text(0, top + 22, head.title, { fontFamily: SERIF, fontSize: '26px', color: css(head.color), fontStyle: 'bold' })
      .setOrigin(0.5);
    const big = s.add.text(0, top + 69, `${fmt(reach)} px deep`, { fontFamily: MONO, fontSize: '24px', color: css(COLORS.ink) }).setOrigin(0.5);
    const sub = s.add
      .text(0, top + 101, subText, {
        fontFamily: SANS,
        fontSize: '14px',
        color: css(COLORS.ink2),
      })
      .setOrigin(0.5);
    const hint = s.add.text(0, height / 2 - 18, 'tap to continue', { fontFamily: SANS, fontSize: '12px', color: css(COLORS.disabled) }).setOrigin(0.5);

    const parts: Phaser.GameObjects.GameObject[] = [g, headText, big, sub, hint];

    if (rows.length) {
      g.lineStyle(1, COLORS.brass, 0.35);
      g.lineBetween(-width / 2 + 18, top + 118, width / 2 - 18, top + 118);
      parts.push(
        s.add
          .text(0, top + 130, 'who carried it today', { fontFamily: SANS, fontSize: '11px', color: css(COLORS.disabled) })
          .setOrigin(0.5)
      );
      rows.forEach((row, i) => {
        const y = top + 148 + i * 19;
        g.fillStyle(i === 0 ? COLORS.brassHi : COLORS.brass, i === 0 ? 1 : 0.5);
        g.fillCircle(-width / 2 + 30, y, i === 0 ? 4 : 3);
        parts.push(
          s.add
            .text(-width / 2 + 42, y, `u/${row.name}`, { fontFamily: SANS, fontSize: '13px', color: css(COLORS.ink) })
            .setOrigin(0, 0.5),
          s.add
            .text(width / 2 - 24, y, `+${fmt(row.px)} px`, { fontFamily: MONO, fontSize: '13px', color: css(COLORS.brassDark) })
            .setOrigin(1, 0.5)
        );
      });
    }

    // The dissolve is the mechanic nothing else has, and until now it happened
    // silently overnight where nobody could see it. Say it out loud.
    if (dissolveLine) {
      const y = height / 2 - 40;
      const n = dissolved === 1 ? '1 part' : `${dissolved} parts`;
      parts.push(
        s.add
          .text(0, y, `${n} the marble abandoned dissolved overnight`, {
            fontFamily: SANS,
            fontSize: '11px',
            color: css(COLORS.pipRim),
          })
          .setOrigin(0.5)
      );
    }

    // Do NOT call setSize() here. On a Container it sets displayOrigin to (w/2, h/2),
    // and Phaser adds displayOrigin to the local point before testing the hit area,
    // which shifts the clickable region half the card up and left. That is what made
    // "tap to continue" dead: it sits below the shifted region's bottom edge.
    const card = s.add.container(this.w / 2, this.h + height, parts).setDepth(80);
    card.setInteractive(new Phaser.Geom.Rectangle(-width / 2, top, width, height), Phaser.Geom.Rectangle.Contains);
    card.on('pointerdown', () => onClose());
    this.resultCard = card;
    s.tweens.add({ targets: card, y: this.h - 40 - height / 2, duration: 420, ease: 'Back.out' });
  }

  hideResult(): void {
    const card = this.resultCard;
    if (!card) return;
    this.resultCard = undefined;
    this.scene.tweens.add({
      targets: card,
      y: this.h + 180,
      duration: 300,
      ease: 'Cubic.in',
      onComplete: () => card.destroy(),
    });
  }
}

const RESULT_HEAD: Record<CliffhangerState, { title: string; color: number }> = {
  record: { title: 'NEW RECORD!', color: COLORS.pipRim },
  tied: { title: 'So close: tied', color: COLORS.brassDark },
  capped: { title: 'Capped short', color: COLORS.ink2 },
  goal: { title: 'GOAL REACHED!', color: COLORS.goalReady },
  quiet: { title: 'The machine rested', color: COLORS.ink2 },
  firstday: { title: 'The first run', color: COLORS.brassDark },
};
