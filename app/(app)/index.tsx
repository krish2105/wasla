import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';
import { useTheme, type ThemePreference } from '../../lib/theme-provider';

type ProfileRow = {
  id: string;
  full_name: string | null;
  headline: string | null;
  visa_status: string | null;
};

const PREFERENCES: { value: ThemePreference; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'ink', label: 'Ink' },
  { value: 'system', label: 'System' },
];

export default function Profile() {
  const { session, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    getSupabase()
      .from('profiles')
      .select('id, full_name, headline, visa_status')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setProfile(data);
      });
  }, [userId]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-8 p-6">
        <View className="gap-2">
          <Text className="font-display text-3xl text-text">Profile</Text>
          <Text className="font-data text-base text-textMuted">{session?.user.email}</Text>
        </View>

        <View className="gap-3 rounded border border-border bg-surface p-4">
          {error ? (
            <Text className="font-body text-base text-danger">{error}</Text>
          ) : profile ? (
            <>
              <Field label="Name" value={profile.full_name} />
              <Field label="Headline" value={profile.headline} />
              <Field label="Visa status" value={profile.visa_status} />
              <Text className="font-body text-base text-textMuted">
                Nothing here yet. Resume upload fills this in next week.
              </Text>
            </>
          ) : (
            <Text className="font-body text-base text-textMuted">Loading your profile.</Text>
          )}
        </View>

        <View className="gap-3">
          <Text className="font-display text-xl text-text">Theme</Text>
          <View className="flex-row gap-2">
            {PREFERENCES.map(({ value, label }) => {
              const selected = preference === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setPreference(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={`min-h-[44px] flex-1 items-center justify-center rounded border px-3 ${
                    selected ? 'border-accent bg-surfaceRaised' : 'border-border bg-surface'
                  }`}
                >
                  <Text className={`font-body text-base ${selected ? 'text-accent' : 'text-textMuted'}`}>
                    {selected ? `✓ ${label}` : label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={signOut}
          className="min-h-[48px] items-center justify-center rounded border border-border px-4"
        >
          <Text className="font-body text-base text-danger">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="gap-1">
      <Text className="font-body text-base text-textMuted">{label}</Text>
      <Text className="font-body text-base text-text">{value ?? 'Not set'}</Text>
    </View>
  );
}
