"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { getSupabase } from "@/lib/guest-auth";
import { Spinner } from "@/components/Spinner";

const GuestContext = createContext<User | null>(null);

export function useGuest() {
  const user = useContext(GuestContext);
  if (!user) throw new Error("A guest session is required.");
  return user;
}

export function GuestGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const auth = getSupabase().auth;
      const { data } = auth.onAuthStateChange((_event, session) => {
        if (active) setUser(session?.user ?? null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setError("We could not restore your guest session. Please try again.");
        else setUser(data.session?.user ?? null);
        setChecking(false);
      }).catch(() => {
        if (active) {
          setError("We could not restore your guest session. Please reload this page.");
          setChecking(false);
        }
      });
    } catch (error) {
      // Run after mount so a missing configuration never breaks server rendering.
      queueMicrotask(() => {
        if (active) {
          setError(error instanceof Error ? error.message : "Guest sign-in is unavailable.");
          setChecking(false);
        }
      });
    }
    return () => { active = false; unsubscribe(); };
  }, []);

  async function continueAsGuest(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const auth = getSupabase().auth;
      // Reuse an existing session instead of creating a replacement identity.
      const existing = await auth.getSession();
      if (existing.error) throw existing.error;
      if (existing.data.session) { setUser(existing.data.session.user); return; }
      const { data, error } = await auth.signInAnonymously({
        options: { data: { display_name: name.trim() || "Traveler" } },
      });
      if (error || !data.user) {
        throw new Error("We could not start your guest profile. Please try again or ask the team to check anonymous sign-in settings.");
      }
      setUser(data.user);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Guest sign-in is temporarily unavailable.");
    } finally { setBusy(false); }
  }

  if (checking) return <p role="status" className="mx-auto flex max-w-xl items-center gap-3 px-6 py-16"><Spinner /> Restoring your guest profile…</p>;
  if (user) return <GuestContext.Provider value={user}><div key={user.id}>{children}</div></GuestContext.Provider>;

  return (
    <section className="mx-auto w-full max-w-lg px-6 py-16" aria-labelledby="guest-heading">
      <Link href="/" className="text-sm text-primary underline underline-offset-4">Back to home</Link>
      <h1 id="guest-heading" className="mt-8 text-3xl font-bold">Your trip, your space.</h1>
      <p className="mt-4 text-muted">Create a guest profile to save your access needs and itineraries. No email or password needed.</p>
      <form onSubmit={continueAsGuest} className="mt-8 space-y-5">
        <div>
          <label htmlFor="guest-name" className="block font-medium">What should we call you? <span className="text-sm text-muted">(optional)</span></label>
          <input id="guest-name" autoComplete="nickname" maxLength={60} value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3" />
        </div>
        <p id="guest-limits" className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">Your profile is remembered in this browser. Clearing browser data or switching devices can lose access to your saved trips.</p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} aria-describedby="guest-limits" className="flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-60">
          {busy && <Spinner />} {busy ? "Creating your guest profile…" : "Continue as guest"}
        </button>
      </form>
    </section>
  );
}
