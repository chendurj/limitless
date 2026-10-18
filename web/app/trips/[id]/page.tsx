import { Suspense } from "react";
import type { Metadata } from "next";
import { TripScreen } from "@/components/itinerary/TripScreen";
import { Spinner } from "@/components/Spinner";

export const metadata: Metadata = {
  title: "Your trip — Limitless",
};

export default function TripPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto flex w-full max-w-2xl items-center gap-3 px-6 py-16 text-muted">
          <Spinner className="text-primary" />
          Loading your trip…
        </p>
      }
    >
      <TripScreen />
    </Suspense>
  );
}
