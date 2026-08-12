import { vars } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

import { readPreference, writePreference } from './preference-store';
import { themes, themeVars, type ThemeName } from './theme';

export type ThemePreference = ThemeName | 'system';

const STORAGE_KEY = 'wasla.theme';

type ThemeContextValue = {
  /** What the user chose. */
  preference: ThemePreference;
  /** What that resolves to right now, after consulting the OS. */
  theme: ThemeName;
  /** Resolved token values, for the few RN props that take a colour rather than a class. */
  colors: (typeof themes)[ThemeName];
  /** False until the stored preference has been read, so we can hold the splash. */
  isLoaded: boolean;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: string | null): value is ThemePreference {
  return value === 'ink' || value === 'paper' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    readPreference(STORAGE_KEY)
      .then((stored) => {
        if (isPreference(stored)) setPreferenceState(stored);
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void writePreference(STORAGE_KEY, next);
  }, []);

  const theme: ThemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'ink' : 'paper') : preference;

  const value = useMemo(
    () => ({ preference, theme, colors: themes[theme], isLoaded, setPreference }),
    [preference, theme, isLoaded, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* The only place tokens are bound. Every colour class in the tree
          resolves against these CSS variables. */}
      <View style={vars(themeVars(theme))} className="flex-1 bg-bg">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
