"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, type ItemOut, type TripOut } from "@/lib/api";
import { useAnnounce } from "@/components/LiveRegion";
import { ItineraryView, type StatusChange } from "@/components/itinerary/ItineraryView";
import { TellLimitless } from "@/components/itinerary/TellLimitless";
import { Spinner } from "@/components/Spinner";

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

// Loads a trip from the API by the [id] route param and renders it, with
// accessible loading and error states. Live mode: mark stops, Tell Limitless, Undo.
export function TripScreen() {
  const params = useParams<{ id: string }>();
  const tripId = typeof params.id === "string" ? params.id : "";
  const announce = useAnnounce();
  const [trip, setTrip] = useState<TripOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [undoVersion, setUndoVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    announce("Loading your trip.");
    api
      .getTrip(tripId)
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
  }, [tripId, announce]);

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
    if (!trip) return;
    setBusyItemId(item.id);
    try {
      replaceItem(await api.updateItem(trip.id, item.id, { status }));
      announce(status === "done" ? `${item.title} is done.` : `You are at ${item.title}.`);
    } catch (err) {
      announce(errorText(err, "We could not save that."), "assertive");
    } finally {
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
    if (!trip || undoVersion === null) return;
    try {
      const result = await api.applyVersion(trip.id, undoVersion);
      setTrip(result.trip);
      setUndoVersion(null);
      setNotice(result.message);
      announce(result.message);
    } catch (err) {
      announce(errorText(err, "We could not undo that."), "assertive");
    }
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">We couldn&rsquo;t load your trip</h1>
        <p className="mt-3 text-muted">{error}</p>
        <p className="mt-2 text-sm text-muted">
          Make sure the API is running and your token is set in web/.env.local.
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
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  Undo
                </button>
              )}
            </div>
          )}
          <TellLimitless trip={trip} onApplied={onApplied} />
        </div>
      }
    />
  );
}
