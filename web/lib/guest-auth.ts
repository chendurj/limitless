import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabase() {
  if (typeof window === "undefined") throw new Error("Guest sessions are available in the browser.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("sb_secret_")) {
    throw new Error("Guest sign-in is not configured. Please ask the Limitless team to connect it.");
  }
  // Share one auth client across screens so refresh timers and session events agree.
  // The browser receives only a publishable key; ownership is enforced by the API.
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export async function guestAccessToken() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) {
    throw new Error("Your guest session is unavailable. Open My trips to continue as guest.");
  }
  return data.session.access_token;
}
