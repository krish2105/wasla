import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSupabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme-provider';

export default function Verify() {
  const { colors } = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canVerify = !isVerifying && code.trim().length === 6;

  async function verify() {
    setIsVerifying(true);
    setError(null);

    // On success onAuthStateChange fires and (auth)/_layout redirects to "/".
    const { error: verifyError } = await getSupabase().auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });

    setIsVerifying(false);
    if (verifyError) setError(verifyError.message);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-2">
          <Text className="font-display text-3xl text-text">Check your email</Text>
          <Text className="font-body text-base text-textMuted">
            We sent a six-digit code to {email}. It expires in one hour.
          </Text>
        </View>

        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          className="min-h-[48px] rounded border border-border bg-surface px-4 font-data text-2xl tracking-widest text-text"
        />

        {error ? (
          <Text className="font-body text-base text-danger">{error}</Text>
        ) : null}

        <Pressable
          onPress={verify}
          disabled={!canVerify}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canVerify }}
          className={`min-h-[48px] items-center justify-center rounded bg-accent px-4 ${
            canVerify ? '' : 'opacity-50'
          }`}
        >
          {isVerifying ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text className="font-body text-base text-bg">Sign in</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()} className="min-h-[44px] justify-center">
          <Text className="font-body text-base text-accent">Use a different email</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
