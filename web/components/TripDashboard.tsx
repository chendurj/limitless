"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ProfileOut, type TripOut } from "@/lib/api";
import { getSupabase } from "@/lib/guest-auth";
import { useGuest } from "@/components/GuestGate";
import { Spinner } from "@/components/Spinner";

function Icon({ kind, className = "h-5 w-5" }: { kind: "grid" | "route" | "plus" | "arrow" | "sparkle" | "edit"; className?: string }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    route: "M7 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 6v8a4 4 0 0 0 4 4h6a4 4 0 0 0 0-8h-4",
    plus: "M12 5v14M5 12h14",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
    edit: "m15 5 4 4M4 20l5-1L21 7a2.8 2.8 0 0 0-4-4L5 15l-1 5Z",
  };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg>;
}

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const tripEnd = (trip: TripOut) => trip.days.at(-1)?.date ?? trip.start_date;

function TripCard({ trip, past }: { trip: TripOut; past: boolean }) {
  const stopCount = trip.days.flatMap(day => day.items).filter(item => item.place && item.status !== "skipped").length;
  const link = `/trips/${trip.id}`;
  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-lg">
      <div className="relative overflow-hidden border-b border-border bg-linear-to-br from-primary/15 via-accent-soft to-surface px-6 py-7">
        <svg aria-hidden="true" viewBox="0 0 240 110" className="absolute -right-4 top-0 h-full w-52 text-primary/15" fill="none"><path d="M10 100C40 15 80 100 120 40S210 85 235 0" stroke="currentColor" strokeWidth="2" strokeDasharray="5 7" /><circle cx="120" cy="40" r="8" stroke="currentColor" strokeWidth="2" /></svg>
        <div className="relative flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Icon kind="route" /> San Diego</span><span className="rounded-full border border-primary/20 bg-surface/80 px-3 py-1 text-xs font-medium">{past ? "Past trip" : "Upcoming"}</span></div>
        <h3 className="relative mt-6 text-xl font-semibold"><Link href={link} className="hover:underline">Your San Diego escape</Link></h3>
        <p className="relative mt-1 text-sm text-muted">{dateLabel(trip.start_date)} · {trip.nights} nights</p>
      </div>
      <div className="p-6">
        <p className="text-xs font-medium text-muted">{trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"} · {stopCount} stops · Version {trip.version}</p>
        <p className="mt-3 line-clamp-2 min-h-12 text-sm text-muted">{trip.profile_summary}</p>
        <Link href={link} className="mt-5 flex items-center justify-between rounded-lg bg-surface-muted px-4 py-3 text-sm font-semibold">Open itinerary <Icon kind="arrow" className="h-4 w-4" /></Link>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link href={`${link}?edit=ai`} className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-accent-soft px-2 py-3 text-sm font-semibold text-primary"><Icon kind="sparkle" className="h-4 w-4" /> Edit with AI</Link>
          <Link href={`${link}?edit=manual`} className="flex items-center justify-center gap-2 rounded-lg border border-border px-2 py-3 text-sm font-medium"><Icon kind="edit" className="h-4 w-4" /> Edit manually</Link>
        </div>
      </div>
    </li>
  );
}

export function TripDashboard() {
  const user = useGuest();
  const [trips, setTrips] = useState<TripOut[]>([]);
  const [profiles, setProfiles] = useState<ProfileOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All trips" | "Upcoming" | "Past">("All trips");
  const displayName = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : "Traveler";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcoming = trips.filter(trip => tripEnd(trip) >= today);
  const visible = trips.filter(trip => {
    const matchesFilter = filter === "All trips" || (filter === "Upcoming" ? tripEnd(trip) >= today : tripEnd(trip) < today);
    return matchesFilter && `San Diego ${trip.start_date} ${dateLabel(trip.start_date)} ${trip.profile_summary}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    let active = true;
    Promise.all([api.listTrips(), api.listProfiles()]).then(([trips, profiles]) => {
      if (active) { setTrips(trips); setProfiles(profiles); setError(""); }
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : "We could not load your trips.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id, attempt]);

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim().slice(0, 60);
    setSaving(true);
    setNotice("");
    try {
      const { error } = await getSupabase().auth.updateUser({ data: { display_name: name || "Traveler" } });
      if (error) throw error;
      setNotice("Your profile name is saved.");
    } catch { setNotice("We could not save your name. Please try again."); }
    finally { setSaving(false); }
  }

  const stats = [
    { label: "Saved trips", value: trips.length, kind: "grid" as const },
    { label: "Upcoming adventures", value: upcoming.length, kind: "route" as const },
    { label: "Planned stops", value: trips.flatMap(t => t.days.flatMap(d => d.items)).filter(i => i.place && i.status !== "skipped").length, kind: "sparkle" as const },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border p-7 lg:flex">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-primary">limitless.</Link>
        <p className="mt-12 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Your travel space</p>
        <nav aria-label="Dashboard" className="mt-4 space-y-2">
          <Link href="/my-trips" aria-current="page" className="flex items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm font-semibold text-primary"><Icon kind="grid" /> My trips</Link>
          <Link href="/intake" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted hover:bg-surface"><Icon kind="plus" /> Plan a new trip</Link>
        </nav>
        <div className="mt-auto border-t border-border pt-6">
          <div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft font-semibold text-primary">{displayName.slice(0, 1).toUpperCase()}</span><div><p className="max-w-36 truncate text-sm font-semibold">{displayName}</p><a href="#profile" className="text-xs text-muted underline underline-offset-4">Guest profile</a></div></div>
          <p className="mt-4 text-xs leading-relaxed text-muted">Saved to this browser. Clearing browser data or switching devices can lose access.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-5 py-7 sm:px-10 lg:px-12">
        <nav aria-label="Dashboard shortcuts" className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <Link href="/" className="text-sm text-muted hover:text-primary">← Back to home</Link>
          <Link href="/intake" className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Icon kind="plus" className="h-4 w-4" /> Plan a new trip</Link>
        </nav>
        <header className="mt-10"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Make room for adventure</p><h1 className="mt-3 text-4xl font-bold tracking-tight">My trips<span className="text-primary">.</span></h1><p className="mt-3 text-muted">Welcome back, {displayName}. Pick up a plan, make it yours, and keep exploring.</p></header>
        <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">{stats.map(stat => <div key={stat.label} className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-5"><span className="rounded-xl bg-accent-soft p-3 text-primary"><Icon kind={stat.kind} /></span><div><dt className="text-xs text-muted">{stat.label}</dt><dd className="mt-1 text-2xl font-semibold">{loading || error ? "—" : stat.value}</dd></div></div>)}</dl>

        <section aria-labelledby="saved-heading" className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="saved-heading" className="text-xl font-semibold">Your itineraries</h2><div className="w-full sm:w-64"><label htmlFor="trip-search" className="sr-only">Search saved itineraries</label><input id="trip-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your trips…" className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm" /></div></div>
          <div className="mt-5 flex gap-2 border-b border-border pb-4" aria-label="Filter itineraries">{(["All trips", "Upcoming", "Past"] as const).map(label => <button key={label} type="button" aria-pressed={filter === label} onClick={() => setFilter(label)} className={`rounded-full px-4 py-2 text-sm font-medium ${filter === label ? "bg-accent-soft text-primary" : "text-muted hover:bg-surface"}`}>{label}</button>)}</div>
          {loading && <p role="status" className="flex items-center gap-3 py-16"><Spinner /> Loading your trips…</p>}
          {error && <div className="rounded-2xl border border-border bg-surface p-8"><p role="alert">{error}</p><button onClick={() => { setLoading(true); setError(""); setAttempt(n => n + 1); }} className="mt-3 text-primary underline">Try again</button></div>}
          {!loading && !error && trips.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-primary/30 bg-linear-to-br from-accent-soft to-surface px-6 py-12 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-surface text-primary"><Icon kind="route" className="h-8 w-8" /></span><h3 className="mt-6 text-2xl font-semibold">Your next adventure starts here.</h3><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">Build a trip around your access needs. We’ll save it here so you can come back, ask AI for changes, or make edits yourself.</p><Link href="/intake" className="mt-7 inline-flex items-center gap-3 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">Plan your first trip <Icon kind="arrow" className="h-4 w-4" /></Link></div>}
          {!loading && !error && trips.length > 0 && visible.length === 0 && <p role="status" className="py-12 text-center text-muted">No trips match this search or filter.</p>}
          {!loading && !error && visible.length > 0 && <ul className="mt-6 grid gap-5 xl:grid-cols-2">{visible.map(trip => <TripCard key={trip.id} trip={trip} past={tripEnd(trip) < today} />)}</ul>}
          {trips.length === 50 && <p className="mt-4 text-sm text-muted">Showing your 50 most recent trips.</p>}
        </section>
        <section aria-label="Ways to make your trip yours" className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-5"><Icon kind="sparkle" className="h-5 w-5 text-primary" /><h2 className="mt-3 text-sm font-semibold">A little help from AI</h2><p className="mt-2 text-xs leading-relaxed text-muted">Open a saved trip and choose Edit with AI. Describe what changed, review the suggestion, then apply it.</p></div>
          <div className="rounded-2xl border border-border p-5"><Icon kind="edit" className="h-5 w-5 text-primary" /><h2 className="mt-3 text-sm font-semibold">The details, your way</h2><p className="mt-2 text-xs leading-relaxed text-muted">Choose Edit manually to skip or restore stops, keep favorites during re-planning, and add personal notes.</p></div>
        </section>
        <details id="profile" className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <summary className="cursor-pointer text-sm font-semibold">Your guest profile & preferences</summary>
          <p className="mt-3 text-xs text-muted">Your profile is remembered in this browser. Clearing browser data or changing devices can lose access to your saved trips.</p>
          <form onSubmit={saveName} className="mt-5 flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><label htmlFor="profile-name" className="block text-sm font-medium">Name or nickname</label><input key={displayName} id="profile-name" name="name" autoComplete="nickname" maxLength={60} defaultValue={displayName} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2" /></div><button disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-60">{saving ? "Saving…" : "Save name"}</button></form>
          <p role="status" className="mt-3 text-sm text-muted">{notice}</p>
          {profiles[0] && <div className="mt-4 border-t border-border pt-4"><h3 className="text-sm font-semibold">Your latest access needs</h3><p className="mt-2 text-sm text-muted">{profiles[0].dna.summary}</p></div>}
        </details>
      </div>
    </div>
  );
}
