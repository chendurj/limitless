import type { Metadata } from "next";
import { GuestGate } from "@/components/GuestGate";
import { SavedTrips } from "@/components/SavedTrips";

export const metadata: Metadata = { title: "My trips — Limitless" };

export default function MyTripsPage() {
  return <GuestGate><SavedTrips /></GuestGate>;
}
