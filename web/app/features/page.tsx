import type { Metadata } from "next";
import Link from "next/link";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

export const metadata: Metadata = {
  title: "Features | Limitless",
};

const features = [
  {
    title: "Personalized itineraries",
    body: "Built around your access needs, interests, stamina, sensory preferences, and pace.",
  },
  {
    title: "Accessibility Score",
    body: "How well each place actually fits you, not just a simple “accessible” flag.",
  },
  {
    title: "Verification Score",
    body: "How confident we are in each fact, with its source and the date it was checked.",
  },
  {
    title: "Live adjustments",
    body: "Tell us you're tired or something changed, and the rest of your day re-plans. Stops you've finished stay put.",
  },
  {
    title: "24/7 support",
    body: "An AI travel agent available any time, that hands off to a real person when the data isn't enough.",
  },
  {
    title: "Credible by design",
    body: "Official sources and human review. Anything we can't back up stays marked unknown.",
  },
];

const promises = [
  {
    title: "Keyboard friendly",
    body: "Every step works without a mouse, with a clear focus outline.",
  },
  {
    title: "Screen-reader ready",
    body: "Labels, landmarks, and spoken status updates throughout.",
  },
  {
    title: "Sourced facts",
    body: "Each claim shows its source, confidence level, and date.",
  },
  {
    title: "Your consent",
    body: "You choose what's shared, and you can delete your data any time.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Features</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Everything that makes a plan actually fit you.
      </p>

      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <li
            key={feature.title}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h2 className="text-base font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted">{feature.body}</p>
          </li>
        ))}
      </ul>

      {/* What a stop looks like */}
      <h2 className="mt-16 text-2xl font-bold">What a stop looks like</h2>
      <div
        aria-label="Example of an itinerary stop"
        className="mt-6 max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Example stop
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold">
          Balboa Park, El Prado Promenade
        </p>
        <p className="text-sm text-muted">Wide, flat, paved walkway</p>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3">
            <ConfidenceBadge level="VERIFIED" />
            <span className="text-sm">
              Step-free paved route the full length.{" "}
              <span className="text-muted">Source: Balboa Park</span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <ConfidenceBadge level="COMMUNITY" />
            <span className="text-sm">
              Accessible restrooms near the fountain.{" "}
              <span className="text-muted">Source: traveler reports</span>
            </span>
          </li>
        </ul>
        <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm">
          <span className="font-semibold text-primary">Why it fits you:</span>{" "}
          no stairs or steep slopes, with places to rest.
        </p>
      </div>

      {/* Built for everyone */}
      <h2 className="mt-16 text-2xl font-bold">Built for everyone</h2>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {promises.map((item) => (
          <li key={item.title}>
            <h3 className="text-base font-semibold text-primary">{item.title}</h3>
            <p className="mt-2 text-sm text-muted">{item.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-12">
        <Link
          href="/"
          className="font-semibold text-primary underline underline-offset-4"
        >
          Back to home
        </Link>
      </p>
    </div>
  );
}
