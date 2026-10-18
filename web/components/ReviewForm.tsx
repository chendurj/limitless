"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const MAX = 1000;
const ratingWords = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// An anonymous review: no name or account. The team reads it before it is shown.
export function ReviewForm() {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [context, setContext] = useState("");
  const [website, setWebsite] = useState(""); // hidden; only bots fill it
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) return setError("Choose a rating from 1 to 5 stars.");
    if (!body.trim()) return setError("Write your review first.");
    setError("");
    setState("sending");
    try {
      await api.createReview({
        rating,
        body: body.trim(),
        context: context.trim(),
        website,
      });
      setState("sent");
    } catch (cause) {
      setState("idle");
      setError(
        cause instanceof ApiError && cause.status === 429
          ? "You sent several reviews just now. Please try again later."
          : "We could not send your review. Please try again.",
      );
    }
  }

  if (state === "sent") {
    return (
      <p
        role="status"
        className="mt-6 rounded-xl border border-border bg-surface p-5"
      >
        <span className="font-semibold">Thank you for your review.</span> We
        read every review. It will show on this page after we check it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-5">
      <fieldset>
        <legend className="font-semibold">Your rating</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer rounded-md p-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}, {ratingWords[n]}
              </span>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill={n <= rating ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
                className="text-amber-500"
              >
                <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z" />
              </svg>
            </label>
          ))}
        </div>
        <p className="mt-1 text-sm text-muted" aria-hidden="true">
          {rating ? ratingWords[rating] : "Choose 1 to 5 stars."}
        </p>
      </fieldset>

      <div>
        <label htmlFor="review-body" className="block font-semibold">
          Your review
        </label>
        <textarea
          id="review-body"
          rows={4}
          maxLength={MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby="review-body-help"
          className="mt-2 w-full rounded-lg border border-border bg-surface p-3 text-base"
        />
        <p id="review-body-help" className="mt-1 text-sm text-muted">
          {MAX - body.length} characters left. Do not include your name or
          health details.
        </p>
      </div>

      <div>
        <label htmlFor="review-context" className="block font-semibold">
          Your needs <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="review-context"
          type="text"
          maxLength={100}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="For example: wheelchair user, Deaf, on crutches"
          className="mt-2 w-full max-w-md rounded-lg border border-border bg-surface px-4 py-2 text-base"
        />
      </div>

      {/* Hidden from people and screen readers. Spam bots fill every field. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label htmlFor="review-website">Website</label>
        <input
          id="review-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
      >
        {state === "sending" && <Spinner size={16} />}
        {state === "sending" ? "Sending…" : "Send anonymous review"}
      </button>
      <p className="text-sm text-muted">
        We do not ask for your name or keep your address. We check each review
        before we show it.
      </p>
    </form>
  );
}
