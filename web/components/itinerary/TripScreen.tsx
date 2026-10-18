"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { components } from "@/types/api";
import { useAnnounce } from "@/components/LiveRegion";
import { ItineraryView } from "@/components/itinerary/ItineraryView";

type TripOut = components["schemas"]["TripOut"];

// Loads a trip from the API by the [id] route param and renders it, with
// accessible loading and error states.
export function TripScreen() {
  const params = useParams<{ id: string }>();
  const tripId = typeof params.id === "string" ? params.id : "";
  const announce = useAnnounce();
  const [trip, setTrip] = useState<TripOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setTrip(null);
    setError(null);
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
        setError(
          err instanceof ApiError ? err.message : "Something went wrong loading your trip.",
        );
        announce("We could not load your trip.", "assertive");
      });
    return () => {
      active = false;
    };
  }, [tripId, announce]);

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
        <p className="text-muted">Loading your trip…</p>
      </div>
    );
  }

  return <ItineraryView trip={trip} />;
}
