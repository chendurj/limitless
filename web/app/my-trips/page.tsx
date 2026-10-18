import type { Metadata } from "next";
import { GuestGate } from "@/components/GuestGate";
import { TripDashboard } from "@/components/TripDashboard";

export const metadata: Metadata = { title: "My trips — Limitless" };

export default function MyTripsPage() {
  return <GuestGate><TripDashboard /></GuestGate>;
}
