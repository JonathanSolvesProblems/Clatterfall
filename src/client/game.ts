import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';
import { Boot } from './scenes/Boot';
import { Build } from './scenes/Build';
import { Run } from './scenes/Run';
import { COLORS } from '../shared/theme';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: COLORS.paper,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 800,
  },
  scene: [Boot, Build, Run],
};

const start = (parent: string): Phaser.Game => new Game({ ...config, parent });

document.addEventListener('DOMContentLoaded', () => {
  start('game-container');
});
