import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works | Limitless",
};

const stats = [
  { value: "1 in 6", label: "people live with a significant disability, 1.3 billion worldwide (WHO)." },
  { value: "28.7%", label: "of U.S. adults reported a disability in 2022 (CDC)." },
  { value: "$50B", label: "spent on U.S. disability travel over two years (Open Doors)." },
];

const steps = [
  {
    title: "1. Tell us how you travel",
    body: "A short, adaptive set of questions covers your access needs, interests, stamina, and pace. It only asks what changes the plan.",
  },
  {
    title: "2. We build a plan that fits",
    body: "Each place is scored for how well it fits you, with every accessibility fact tied to a source and a confidence level.",
  },
  {
    title: "3. It adapts as your day goes",
    body: "Tell us you're tired or something changed, and the rest of your day re-plans. Stops you've finished stay put.",
  },
];

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

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">How it works</h1>
      <p className="mt-3 max-w-2xl text-muted">
        An accessible entrance says little about slopes, restrooms, transfers,
        or assistance. We combine curated data, personal fit, and adaptation
        during the trip.
      </p>

      <ol className="mt-8 grid gap-6 sm:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.title}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h2 className="text-base font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>

      {/* Why this matters */}
      <h2 className="mt-16 text-2xl font-bold">Why this matters</h2>
      <div className="mt-6 grid gap-8 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.value}>
            <p className="text-3xl font-extrabold tracking-tight text-primary">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Credible data */}
      <h2 className="mt-16 text-2xl font-bold">We only show what we can back up</h2>
      <p className="mt-3 max-w-2xl text-muted">
        Missing information stays unknown. We never guess. When a place
        doesn&rsquo;t fit, we leave it out and tell you why, so the choice is
        yours.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {skipped.map((place) => (
          <li
            key={place.name}
            className="rounded-xl border border-border bg-surface p-5"
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
