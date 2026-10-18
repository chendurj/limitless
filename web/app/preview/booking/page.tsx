import type { Metadata } from "next";
import { Suspense } from "react";
import type { components } from "@/types/api";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import deaf from "@/fixtures/trip_deaf.json";

export const metadata: Metadata = {
  title: "Booking preview — Limitless",
  robots: { index: false, follow: false },
};

// Existing, labeled demo fixtures only. This preview does not create or modify a trip.
export default function BookingPreview() {
  const trip = deaf as unknown as components["schemas"]["TripOut"];
  return <>
    <div className="mx-auto max-w-2xl px-6 pt-8 text-sm text-muted">
      <p className="font-semibold text-foreground">Demo trip preview</p>
      <p>Explore each day using the tabs below. Booking links open the venue’s website.</p>
    </div>
    <Suspense fallback={<p role="status" className="px-6 py-10">Loading preview…</p>}>
      <ItineraryView trip={trip} />
    </Suspense>
  </>;
}
