/**
 * Clatterfall: the "Sunlit Workbench" palette.
 *
 * A warm, hand-made woodworker's-bench identity (not a dark physics shaft):
 * paper-cream ground, matte wood + brass + steel-teal parts, and a single
 * vermilion hero marble (Pip) that always pops. Every pixel is drawn from
 * Phaser Graphics primitives. No sprite sheets, no AI images.
 *
 * Colors are 0xRRGGBB numbers (Phaser-native). Use {@link css} for CSS strings.
 */

export const COLORS = {
  // Ground / paper
  paper: 0xefe6d2,
  paperHi: 0xf7f0de,
  paperLo: 0xe4d7bc,
  grid: 0xd9c9a6,
  vignette: 0xc9b896,

  // Ink (never pure black)
  ink: 0x2e2a24,
  ink2: 0x6b6152,
  disabled: 0x9a9384,

  // Brass accent (the instrument metal)
  brass: 0xc88a34,
  brassHi: 0xe8b25a,
  brassDark: 0x8a5a1c,

  // Pip, the hero marble (deliberately not brass, so it always reads)
  pip: 0xe4572e,
  pipSpec: 0xffd9b0,
  pipRim: 0xa32d14,
  pipSwirl: 0xf4a24c,

  // Part materials (only three, for a disciplined one-hand look)
  wood: 0xc99a5b,
  woodHi: 0xddbb84,
  woodLo: 0x7c5225,
  brassMat: 0xc88a34,
  brassMatHi: 0xe8b25a,
  brassMatLo: 0x8a5a1c,
  steel: 0x3e8f86,
  steelHi: 0x5fb4a9,
  steelLo: 0x276159,

  // States
  frontier: 0xe8b25a,
  frontierEdge: 0xc88a34,
  valid: 0x6f9e5a,
  invalid: 0xc0503c,
  freshRing: 0xe8b25a,
  decay: 0x9a9384,
  recordPin: 0xc0503c,
  goalReady: 0x6f9e5a,
} as const;

/** Convert a 0xRRGGBB number to a `#rrggbb` CSS string. */
export function css(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Material key -> [fill, highlight, shadow] for the part draw recipe. */
export const MATERIAL = {
  wood: [COLORS.wood, COLORS.woodHi, COLORS.woodLo],
  brass: [COLORS.brassMat, COLORS.brassMatHi, COLORS.brassMatLo],
  steel: [COLORS.steel, COLORS.steelHi, COLORS.steelLo],
} as const;

export type MaterialKey = keyof typeof MATERIAL;
