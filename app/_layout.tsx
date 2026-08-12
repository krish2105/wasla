import '../global.css';

import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans';
import { MartianMono_500Medium } from '@expo-google-fonts/martian-mono';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    InstrumentSans_400Regular,
    MartianMono_500Medium,
  });

  return (
    <ThemeProvider>
      <AuthProvider>
        <Boot fontsReady={fontsLoaded || fontError !== null} />
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Holds the splash screen until fonts, the stored theme preference and the
 * persisted session are all resolved — otherwise the app flashes the wrong
 * theme and the login screen before settling.
 */
function Boot({ fontsReady }: { fontsReady: boolean }) {
  const { isLoaded: themeReady, theme } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const ready = fontsReady && themeReady && !authLoading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={theme === 'ink' ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}
