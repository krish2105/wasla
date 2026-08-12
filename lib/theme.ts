// The only file in this codebase that may contain a colour literal.
// Components reference semantic tokens through NativeWind classes (bg-surface,
// text-textMuted, border-border). They never see these values.

export const themes = {
  ink: {
    bg: '#101D22',
    surface: '#1A2C33',
    surfaceRaised: '#22383F',
    border: 'rgba(122,139,143,0.22)',
    text: '#E4E8E1',
    textMuted: '#93A3A7',
    stamp: '#9E8DD6',
    seal: '#4FA88F',
    flag: '#D9A548',
    danger: '#E0736B',
    accent: '#7FC4D9',
    mrz: '#0A1417',
  },
  paper: {
    bg: '#E4E8E1',
    surface: '#EFF2ED',
    surfaceRaised: '#F7F9F5',
    border: 'rgba(16,29,34,0.14)',
    text: '#101D22',
    textMuted: '#4C6067',
    stamp: '#5B4B8A',
    seal: '#2E7D6B',
    flag: '#8A6018',
    danger: '#A33228',
    accent: '#1F5F73',
    mrz: '#DADFD5',
  },
} as const;

export type ThemeName = keyof typeof themes;
export type Token = keyof typeof themes.ink;

export const TOKENS = Object.keys(themes.ink) as Token[];

/**
 * Feeds NativeWind's vars() at the root of the tree. tailwind.config.js maps
 * every token to var(--c-<token>), so swapping this object restyles the whole
 * app with no `dark:` variants anywhere.
 */
export function themeVars(name: ThemeName): Record<`--c-${Token}`, string> {
  const theme = themes[name];
  const entries = TOKENS.map((token) => [`--c-${token}`, theme[token]]);
  return Object.fromEntries(entries);
}
