import { Suspense } from "react";
import type { Metadata } from "next";
import { TripScreen } from "@/components/itinerary/TripScreen";

export const metadata: Metadata = {
  title: "Your trip — Limitless",
};

export default function TripPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto w-full max-w-2xl px-6 py-16 text-muted">
          Loading your trip…
        </p>
      }
    >
      <TripScreen />
    </Suspense>
  );
}
