import type { Metadata } from "next";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { tripDemo } from "@/lib/tripDemo";

export const metadata: Metadata = {
  title: "Your trip — Limitless",
};

// TODO: fetch the real trip by id once POST /api/trips is live. Demo for now.
export default function TripPage() {
  return <ItineraryView trip={tripDemo} />;
}
