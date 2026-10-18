import type { Metadata } from "next";
import { IntakeWizard } from "@/components/IntakeWizard";
import { GuestGate } from "@/components/GuestGate";

export const metadata: Metadata = {
  title: "Plan your trip — Limitless",
};

export default function IntakePage() {
  return <GuestGate><IntakeWizard /></GuestGate>;
}
