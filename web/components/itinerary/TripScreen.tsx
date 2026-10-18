"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, DEMO_TRIPS, type ItemOut, type TripOut } from "@/lib/api";
import { GuestGate } from "@/components/GuestGate";
import { useAnnounce } from "@/components/LiveRegion";
import { ItineraryView, type StatusChange } from "@/components/itinerary/ItineraryView";
import { TellLimitless } from "@/components/itinerary/TellLimitless";
import { Spinner } from "@/components/Spinner";
import { ManualItineraryEditor } from "@/components/itinerary/ManualItineraryEditor";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

// Loads a trip from the API by the [id] route param and renders it, with
// accessible loading and error states. Live mode: mark stops, Tell Limitless, Undo.
export function TripScreen() {
  // Only the two explicit sample IDs bypass GuestGate, and those render read-only.
  // Every other route resolves the current guest before requesting a personal trip.
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const tripId = typeof params.id === "string" ? params.id : "";
  const sample = tripId === DEMO_TRIPS.ankle ? "ankle" : tripId === DEMO_TRIPS.deaf ? "deaf" : null;
  if (sample) return <TripContent key={tripId} tripId={tripId} sample={sample} />;
  const edit = search.get("edit");
  return <GuestGate><TripContent key={`${tripId}-${edit}`} tripId={tripId} initialEdit={edit} /></GuestGate>;
}

function TripContent({ tripId, sample, initialEdit }: { tripId: string; sample?: "ankle" | "deaf"; initialEdit?: string | null }) {
  const announce = useAnnounce();
  const [trip, setTrip] = useState<TripOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [undoVersion, setUndoVersion] = useState<number | null>(null);
  const actionBusy = useRef(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [manual, setManual] = useState(initialEdit === "manual");

  useEffect(() => {
    let active = true;
    announce("Loading your trip.");
    (sample ? api.getSampleTrip(sample) : api.getTrip(tripId))
      .then((result) => {
        if (!active) return;
        setTrip(result);
        announce("Your trip is ready.");
      })
      .catch((err) => {
        if (!active) return;
        setError(errorText(err, "Something went wrong loading your trip."));
        announce("We could not load your trip.", "assertive");
      });
    return () => {
      active = false;
    };
  }, [tripId, sample, announce]);

  const replaceItem = (updated: ItemOut) =>
    setTrip((current) =>
      current && {
        ...current,
        days: current.days.map((day) => ({
          ...day,
          items: day.items.map((item) => (item.id === updated.id ? updated : item)),
        })),
      },
    );

  const onStatus = async (item: ItemOut, status: StatusChange) => {
    if (!trip || actionBusy.current) return;
    actionBusy.current = true;
    setBusyItemId(item.id);
    try {
      replaceItem(await api.updateItem(trip.id, item.id, { status }));
      announce(status === "done" ? `${item.title} is done.` : `You are at ${item.title}.`);
    } catch (err) {
      announce(errorText(err, "We could not save that."), "assertive");
    } finally {
      actionBusy.current = false;
      setBusyItemId(null);
    }
  };

  const onApplied = (next: TripOut, previous: number) => {
    setTrip(next);
    setUndoVersion(previous);
    setNotice("Your plan is updated.");
    announce("Your plan is updated. You can undo this.");
  };

  const undo = async () => {
    if (!trip || undoVersion === null || actionBusy.current) return;
    actionBusy.current = true;
    setUndoBusy(true);
    try {
      const result = await api.applyVersion(trip.id, undoVersion);
      setTrip(result.trip);
      setUndoVersion(null);
      setNotice(result.message);
      announce(result.message);
    } catch (err) {
      announce(errorText(err, "We could not undo that."), "assertive");
    } finally {
      actionBusy.current = false;
      setUndoBusy(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">We couldn&rsquo;t load your trip</h1>
        <p className="mt-3 text-muted">{error}</p>
        <p className="mt-2 text-sm text-muted">
          <Link href="/my-trips" className="text-primary underline">Return to My trips</Link> to view the itineraries saved to this guest profile.
        </p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16" aria-busy="true">
        <p className="flex items-center gap-3 text-muted">
          <Spinner className="text-primary" />
          Loading your trip…
        </p>
      </div>
    );
  }

  if (sample) return <ItineraryView trip={trip} actions={<p className="text-sm text-muted">This is a read-only sample. <Link href="/intake" className="text-primary underline">Plan your own trip</Link> to save and change an itinerary.</p>} />;

  return (
    <ItineraryView
      trip={trip}
      live={{ onStatus, busyItemId }}
      actions={
        <div className="space-y-4">
          {notice && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-accent-soft px-4 py-3 text-sm">
              <span>{notice}</span>
              {undoVersion !== null && (
                <button
                  type="button"
                  onClick={() => void undo()}
                  disabled={undoBusy || busyItemId !== null}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  Undo
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <TellLimitless trip={trip} onApplied={onApplied} triggerLabel="Edit with AI" initiallyOpen={initialEdit === "ai"} />
            <button type="button" aria-expanded={manual} aria-controls="manual-editor" onClick={() => setManual(value => !value)} className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-5 font-semibold">{manual ? "Close manual editor" : "Edit manually"}</button>
          </div>
          {manual && <ManualItineraryEditor key={trip.version} trip={trip} onSaved={item => { replaceItem(item); setUndoVersion(null); setNotice("Your manual changes are saved."); }} />}
        </div>
      }
    />
  );
}
