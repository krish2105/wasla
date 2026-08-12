const tokens = [
  'bg', 'surface', 'surfaceRaised', 'border', 'text', 'textMuted',
  'stamp', 'seal', 'flag', 'danger', 'accent', 'mrz',
];

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Values come from lib/theme.ts at runtime via themeVars() -> vars().
      colors: Object.fromEntries(tokens.map((t) => [t, `var(--c-${t})`])),
      fontFamily: {
        display: ['BricolageGrotesque_600SemiBold'],
        body: ['InstrumentSans_400Regular'],
        data: ['MartianMono_500Medium'],
      },
      borderRadius: { DEFAULT: '4px', none: '0', full: '9999px' },
    },
  },
  plugins: [],
};
