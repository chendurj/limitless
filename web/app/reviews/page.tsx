import type { Metadata } from "next";
import Link from "next/link";
import { ReviewForm } from "@/components/ReviewForm";

export const metadata: Metadata = {
  title: "Reviews | Limitless",
};

// Sample reviews written for the demo. Each one shows one feature that works today.
const reviews = [
  {
    name: "Priya S.",
    context: "On crutches after ankle surgery",
    rating: 5,
    title: "I finished a day out without pain",
    body: "Limitless skipped the hilly viewpoints I could never manage on crutches, and it told me why: the zoo has steep grades. It planned short walks, seats and a rest break after the long museum visit. For the first time since my injury, I enjoyed a full day out.",
  },
  {
    name: "Marcus T.",
    context: "Deaf, does not use phone calls",
    rating: 5,
    title: "No phone calls, no surprises",
    body: "I'm Deaf and I don't make phone calls. Limitless chose museums with captions and restaurants I could book online. It even warned me that one museum has ASL tours only on the first Saturday of the month, so I went on the right day.",
  },
  {
    name: "Elena R.",
    context: "Manual wheelchair user",
    rating: 5,
    title: "Finally, I know what to trust",
    body: "Other apps say “accessible” and then I find three steps at the door. Limitless shows where each fact comes from and how much to trust it. When the Verification Score is high, it comes from the venue’s own accessibility page. When it’s low, I know to call ahead.",
  },
  {
    name: "James O.",
    context: "Traveling with his father, who uses a walker",
    rating: 4,
    title: "It changed the plan when Dad got tired",
    body: "Halfway through day two, my dad was exhausted. I told Limitless by voice, and it showed a lighter afternoon before changing anything. I tapped Apply. The next morning he felt better, and Undo brought the museum back. I wish it could also book our hotel.",
  },
  {
    name: "Aisha K.",
    context: "Low vision, uses VoiceOver",
    rating: 5,
    title: "I planned the whole trip without a mouse",
    body: "Every step worked with the keyboard and VoiceOver, and I could speak my answers instead of typing. When I asked for changes, Limitless read them aloud to me. The app itself is accessible, not only the places it recommends.",
  },
  {
    name: "Daniel W.",
    context: "Autistic, sensitive to noise and crowds",
    rating: 5,
    title: "Calm places, by design",
    body: "I told it that crowds and noise are hard for me. It found a museum with a Calm Room and left out the loudest, busiest spots. The plan felt like it was made for me, not for an average tourist.",
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <p className="flex gap-0.5 text-amber-500">
      <span className="sr-only">{rating} out of 5 stars</span>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={i < rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z" />
        </svg>
      ))}
    </p>
  );
}

export default function ReviewsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
      <p className="mt-4 text-lg text-muted">
        How Limitless helps travelers plan around their own needs.
      </p>
      <p className="mt-2 text-xs text-muted">Sample reviews for the demo.</p>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {reviews.map((review) => (
          <li key={review.name}>
            <figure className="flex h-full flex-col rounded-xl border border-border bg-surface p-5">
              <Stars rating={review.rating} />
              <h2 className="mt-3 text-lg font-semibold">{review.title}</h2>
              <blockquote className="mt-2 flex-1 text-sm leading-relaxed">
                <p>{review.body}</p>
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold">{review.name}</span>
                <span className="block text-muted">{review.context}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="write-review-heading"
        className="mt-14 border-t border-border pt-10"
      >
        <h2
          id="write-review-heading"
          className="text-2xl font-bold tracking-tight"
        >
          Drop an anonymous review
        </h2>
        <p className="mt-2 text-muted">
          Tell us how Limitless worked for you. No name or account needed.
        </p>
        <ReviewForm />
      </section>

      <Link
        href="/intake"
        className="mt-12 inline-flex items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Plan your trip
      </Link>
    </div>
  );
}
