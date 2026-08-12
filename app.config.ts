import type { ExpoConfig } from 'expo/config';

// Native launch chrome (adaptive icon, splash) is baked into the binary, so it
// cannot read lib/theme.ts at runtime — and Expo's config loader cannot import
// a .ts module. These are the only colour literals outside lib/theme.ts, and
// `npm run check:theme` fails the build if they drift from it.
const INK_BG = '#101D22'; // themes.ink.bg
const PAPER_BG = '#E4E8E1'; // themes.paper.bg

const config: ExpoConfig = {
  name: 'WASLA',
  slug: 'wasla',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'wasla',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'dev.wasla.app',
  },
  android: {
    package: 'dev.wasla.app',
    adaptiveIcon: {
      backgroundColor: INK_BG,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: PAPER_BG,
        dark: { backgroundColor: INK_BG },
      },
    ],
  ],
};

export default config;
