// Expo generates expo-env.d.ts with this same reference, but that file is
// gitignored and only appears after Metro has run once — so `npm run typecheck`
// on a fresh checkout (i.e. in CI) would fail without a committed copy.
/// <reference types="expo/types" />
