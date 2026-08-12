import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSupabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme-provider';

export default function Login() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = !isSending && email.trim().length > 0;

  async function sendCode() {
    setIsSending(true);
    setError(null);

    const { error: sendError } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Lets the emailed link work too when the app is open in a browser.
        emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
      },
    });

    setIsSending(false);

    if (sendError) {
      setError(sendError.message);
      return;
    }

    router.push({ pathname: '/verify', params: { email: email.trim() } });
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-2">
          <Text className="font-display text-3xl text-text">WASLA</Text>
          <Text className="font-body text-base text-textMuted">
            Sign in with your email. We send a six-digit code, no password.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="font-body text-base text-textMuted">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            className="min-h-[48px] rounded border border-border bg-surface px-4 font-body text-base text-text"
          />
        </View>

        {error ? (
          <Text className="font-body text-base text-danger">{error}</Text>
        ) : null}

        {/* Opacity is computed, not a `disabled:` variant: NativeWind maps that
            to CSS :disabled, which never matches the div react-native-web
            renders for Pressable, so the button looked enabled on web. */}
        <Pressable
          onPress={sendCode}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          className={`min-h-[48px] items-center justify-center rounded bg-accent px-4 ${
            canSend ? '' : 'opacity-50'
          }`}
        >
          {isSending ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text className="font-body text-base text-bg">Send code</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
