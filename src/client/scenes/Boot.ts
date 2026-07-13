import { Scene } from 'phaser';
import { COLORS, css } from '../../shared/theme';
import { SANS, SERIF } from '../render/fonts';
import { Synth } from '../audio/synth';
import { net } from '../net';

/** Loads the first state snapshot, wires up audio, then hands off to Build. */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.paper);
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 12, 'Clatterfall', { fontFamily: SERIF, fontSize: '30px', color: css(COLORS.brassDark) })
      .setOrigin(0.5);
    const status = this.add
      .text(width / 2, height / 2 + 26, 'winding up the machine…', { fontFamily: SANS, fontSize: '14px', color: css(COLORS.ink2) })
      .setOrigin(0.5);

    const synth = new Synth();
    synth.init();
    this.registry.set('synth', synth);
    // Unlock audio on the very first pointer anywhere.
    this.input.once('pointerdown', () => synth.unlock());

    const load = () => {
      net
        .state()
        .then((state) => this.scene.start('Build', { state }))
        .catch(() => {
          status.setText('Could not load. Tap to retry.').setColor(css(COLORS.invalid));
          this.input.once('pointerdown', () => {
            status.setText('winding up the machine…').setColor(css(COLORS.ink2));
            load();
          });
        });
    };
    load();
  }
}
