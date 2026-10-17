import type { Metadata } from "next";
import { IntakeWizard } from "@/components/IntakeWizard";

export const metadata: Metadata = {
  title: "Plan your trip — Limitless",
};

export default function IntakePage() {
  return <IntakeWizard />;
}
