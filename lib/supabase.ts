import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

let client: SupabaseClient | null = null;

/**
 * Lazy on purpose. `expo export` prerenders every route in Node, and
 * constructing a Supabase client there throws: supabase-js builds a
 * RealtimeClient eagerly and Node < 22 has no global WebSocket. Every caller
 * runs in an effect or an event handler, so this never fires during prerender.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both in.'
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      // supabase-js already picks localStorage on web and guards for prerender;
      // AsyncStorage is only needed on native.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  return client;
}
