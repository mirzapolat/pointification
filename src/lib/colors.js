export const TEAM_PALETTE = [
  '#FF4FA3', // pink
  '#FFD93D', // yellow
  '#5EE2C1', // mint
  '#4D7CFF', // blue
  '#FF7A59', // coral
  '#9B6DFF', // purple
  '#22C55E', // green
  '#F43F5E', // rose
  '#0EA5E9', // sky
  '#F59E0B'  // amber
]

// Best ink-on-color readability: use #0F0F12 always (palette is light/saturated).
export const INK = '#0F0F12'

// Pick next color not yet used
export function nextColor(usedColors) {
  for (const c of TEAM_PALETTE) if (!usedColors.includes(c)) return c
  return TEAM_PALETTE[usedColors.length % TEAM_PALETTE.length]
}
