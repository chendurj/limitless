"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type TripOut } from "@/lib/api";
import { getSupabase } from "@/lib/guest-auth";
import { useGuest } from "@/components/GuestGate";
import { Spinner } from "@/components/Spinner";

const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

export function SavedTrips() {
  const user = useGuest();
  const [trips, setTrips] = useState<TripOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteBusy = useRef(false);
  const [deleteError, setDeleteError] = useState("");

  async function deleteTrip(tripId: string) {
    if (deleteBusy.current) return;
    deleteBusy.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await api.deleteTrip(tripId);
      setTrips(current => current.filter(trip => trip.id !== tripId));
      setConfirmDelete(null);
      setNotice("Trip deleted.");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the trip. Try again.");
    } finally { deleteBusy.current = false; setDeleting(false); }
  }
  const displayName = typeof user.user_metadata.display_name === "string"
    ? user.user_metadata.display_name : "Traveler";

  useEffect(() => {
    let active = true;
    api.listTrips().then(result => {
      if (active) { setTrips(result); setError(""); }
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
      setNotice("Name saved.");
    } catch { setNotice("We could not save your name. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-14">
      <Link href="/" className="text-sm text-muted hover:text-primary">← Home</Link>

      <header className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">My trips</h1>
        <Link href="/intake" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Plan a trip
        </Link>
      </header>
      <p className="mt-3 text-sm text-muted">Open a saved trip to view or change your plan.</p>

      <section aria-label="Saved itineraries" className="mt-8">
        {loading && <p role="status" className="flex items-center gap-3 py-8 text-muted"><Spinner /> Loading your trips…</p>}
        {error && <div className="rounded-xl border border-border p-5"><p role="alert">{error}</p><button onClick={() => { setLoading(true); setError(""); setAttempt(n => n + 1); }} className="mt-3 text-sm font-medium text-primary underline">Try again</button></div>}
        {!loading && !error && trips.length === 0 && (
          <div className="rounded-xl border border-border bg-surface px-6 py-10">
            <h2 className="text-lg font-semibold">No trips yet</h2>
            <p className="mt-2 text-sm text-muted">Choose Plan a trip to create your first itinerary. It will be saved here.</p>
          </div>
        )}
        {!loading && !error && trips.length > 0 && (
          <ul className="space-y-4">
            {trips.map(trip => (
              <li key={trip.id} className="rounded-xl border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">San Diego</h2>
                    <p className="mt-1 text-sm text-muted">{dateLabel(trip.start_date)} · {trip.nights} nights · {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}</p>
                  </div>
                  <Link href={`/trips/${trip.id}`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">Open itinerary</Link>
                </div>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-4 text-sm">
                  <Link href={`/trips/${trip.id}?edit=ai`} className="font-medium text-primary underline underline-offset-4">Edit with AI</Link>
                  <Link href={`/trips/${trip.id}?edit=manual`} className="font-medium text-muted underline underline-offset-4">Edit manually</Link>
                  <button type="button" onClick={() => { setConfirmDelete(trip.id); setDeleteError(""); }} disabled={deleting} className="font-medium text-danger underline underline-offset-4 sm:ml-auto">Delete trip</button>
                </div>
                {confirmDelete === trip.id && (
                  <div role="group" aria-label="Confirm trip deletion" className="mt-4 rounded-lg border border-border p-4">
                    <p className="text-sm">Delete this trip? This can’t be undone.</p>
                    {deleteError && <p role="alert" className="mt-2 text-sm text-danger">{deleteError}</p>}
                    <div className="mt-3 flex gap-4 text-sm">
                      <button type="button" disabled={deleting} onClick={() => void deleteTrip(trip.id)} className="rounded-lg bg-danger px-4 py-2 font-semibold text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button>
                      <button type="button" disabled={deleting} onClick={() => setConfirmDelete(null)} className="rounded-lg border border-border px-4 py-2">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {trips.length === 50 && <p className="mt-4 text-xs text-muted">Your 50 most recent trips.</p>}
      </section>
      <p role="status" className="mt-3 text-sm text-muted">{notice === "Trip deleted." ? notice : ""}</p>

      <details className="mt-8 border-t border-border pt-5 text-sm">
        <summary className="cursor-pointer text-muted">Guest profile</summary>
        <p className="mt-3 text-sm text-muted">Trips are saved to this browser. Clearing browser data or changing devices can lose access.</p>
        <form onSubmit={saveName} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="profile-name" className="block font-medium">Name or nickname</label>
            <input key={displayName} id="profile-name" name="name" autoComplete="nickname" maxLength={60} defaultValue={displayName} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2" />
          </div>
          <button disabled={saving} className="rounded-lg border border-border px-4 py-2 font-medium disabled:opacity-60">{saving ? "Saving…" : "Save name"}</button>
        </form>
        <p role="status" className="mt-3 text-sm text-muted">{notice}</p>
      </details>
    </div>
  );
}
