import Link from "next/link";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DEMO_TRIPS } from "@/lib/api";

// Plain-language value points under the hero.
const steps = [
  {
    title: "Every fact is sourced",
    body: "Each accessibility detail shows where it came from and how sure we are. We never guess.",
  },
  {
    title: "It skips what won't work",
    body: "Places that don't fit your needs are left out, with a clear reason you can read.",
  },
  {
    title: "It adapts as you go",
    body: "Tell us how a stop felt, and the rest of your day re-plans around you in seconds.",
  },
];

// Example excluded places. Clearly demo data — never presented as real facts.
const skipped = [
  {
    name: "Sunset Cliffs Natural Park",
    reason: "Uneven dirt paths along unfenced cliff edges.",
  },
  {
    name: "Torrey Pines State Reserve",
    reason: "Closed to all visitors until it reopens in spring.",
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

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section
        className="relative overflow-hidden bg-[#070b10] bg-cover bg-center"
        style={{ backgroundImage: "url('/logo-bg-poster.jpg')" }}
      >
        {/* Looping infinity logo. Hidden when the viewer prefers reduced motion;
            the poster image on the section stays as a still fallback. */}
        <video
          autoPlay
          muted
          loop
          playsInline
          poster="/logo-bg-poster.jpg"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-md motion-reduce:hidden"
        >
          <source src="/logo-bg.mp4" type="video/mp4" />
        </video>
        {/* Dark gradient keeps the text at AA+ contrast over the video. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#070b10]/90 via-[#070b10]/70 to-[#070b10]/40"
        />

        <div className="relative mx-auto grid w-full max-w-5xl gap-12 px-6 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-4xl font-bold tracking-tight text-teal-300 sm:text-5xl">
              Limitless
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Trips built around how you move.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-200">
              Tell us your access needs once. We plan a day you can actually do
              — every accessibility fact is sourced, and the plan changes when
              your body says it needs to.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/intake"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Plan your trip
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/30 px-6 font-semibold text-white transition-colors hover:bg-white/10"
              >
                How it works
              </a>
            </div>
            <p className="mt-4 text-sm">
              <Link
                href={`/trips/${DEMO_TRIPS.deaf}`}
                className="text-teal-300 underline underline-offset-4"
              >
                See a sample itinerary
              </Link>
            </p>
          </div>

          {/* Example stop card: shows the cited-fact badges that define the app. */}
          <div
            aria-label="Example of an itinerary stop"
            className="rounded-2xl border border-border bg-surface p-5 shadow-xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Example stop
              </span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                Demo data
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold">
              Balboa Park — El Prado Promenade
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
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        aria-labelledby="how-heading"
        className="border-t border-border"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 id="how-heading" className="text-2xl font-bold">
            How it works
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <li
                key={step.title}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What we skip */}
      <section
        aria-labelledby="skip-heading"
        className="border-t border-border bg-surface"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 id="skip-heading" className="text-2xl font-bold">
            We tell you what we skip — and why
          </h2>
          <p className="mt-3 max-w-2xl text-muted">
            Other planners quietly drop places, or list everything and leave the
            risk to you. We show what we left out and the reason, so the choice
            is yours.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {skipped.map((place) => (
              <li
                key={place.name}
                className="rounded-xl border border-border bg-background p-5"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 12.1L14.1 15.5 12 13.4l-2.1 2.1-1.4-1.4L10.6 12 8.5 9.9l1.4-1.4L12 10.6l2.1-2.1 1.4 1.4L13.4 12Z" />
                    </svg>
                    Skipped
                  </span>
                  <p className="font-semibold">{place.name}</p>
                </div>
                <p className="mt-2 text-sm text-muted">{place.reason}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Examples shown with demo data.</p>
        </div>
      </section>

      {/* Built for everyone */}
      <section
        aria-labelledby="a11y-heading"
        className="border-t border-border"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 id="a11y-heading" className="text-2xl font-bold">
            Built for everyone
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {promises.map((item) => (
              <li key={item.title}>
                <h3 className="text-base font-semibold text-primary">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
