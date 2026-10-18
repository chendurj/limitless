import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Reviews | Limitless",
};

export default function ReviewsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
      <p className="mt-4 text-lg text-muted">
        Traveler reviews are coming soon. You&rsquo;ll be able to see how each
        place worked for people with similar needs.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center font-semibold text-primary underline underline-offset-4"
      >
        Back to home
      </Link>
    </div>
  );
}
