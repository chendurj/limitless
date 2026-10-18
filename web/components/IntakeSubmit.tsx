"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { components } from "@/types/api";
import { intakeScreens, type IntakeQuestion } from "@/lib/intakeQuestions";
import { useAnnounce } from "@/components/LiveRegion";
import type { FieldValue } from "@/components/QuestionField";

type IntakeResponse = components["schemas"]["IntakeResponse"];
type Followup = components["schemas"]["Followup"];
type QAnswer = components["schemas"]["QAnswer"];

// Look up a question's config by id (to know how to shape its answer).
const QUESTIONS: Record<string, IntakeQuestion> = {};
for (const screen of intakeScreens) {
  for (const question of screen.questions) QUESTIONS[question.id] = question;
}

function isEmptyValue(value: FieldValue | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return value.must.length === 0 && value.nice.length === 0;
}

// Turn one wizard answer into the API's { selected, other, freeform } shape.
function toQAnswer(question: IntakeQuestion | undefined, value: FieldValue, other: string): QAnswer {
  const otherText = other.trim() ? other.trim() : null;
  // must-nice: send the must-haves as selected, note the nice-to-haves in words.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nice = value.nice.length ? `Also nice to have: ${value.nice.join(", ")}` : null;
    return { selected: value.must, other: otherText, freeform: nice };
  }
  if (Array.isArray(value)) return { selected: value, other: otherText, freeform: null };
  const isText =
    question?.inputType === "text" ||
    question?.inputType === "number" ||
    question?.inputType === "date";
  if (isText) return { selected: [], other: otherText, freeform: value || null };
  return { selected: value ? [value] : [], other: otherText, freeform: null };
}

function buildAnswers(
  answers: Record<string, FieldValue>,
  others: Record<string, string>,
): Record<string, QAnswer> {
  const out: Record<string, QAnswer> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (isEmptyValue(value) && !others[id]?.trim()) continue;
    out[id] = toQAnswer(QUESTIONS[id], value, others[id] ?? "");
  }
  return out;
}

type Phase = "submitting" | "followups" | "review" | "creating" | "error";

export function IntakeSubmit({
  answers,
  others,
  onBack,
}: {
  answers: Record<string, FieldValue>;
  others: Record<string, string>;
  onBack: () => void;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [phase, setPhase] = useState<Phase>("submitting");
  const [profileId, setProfileId] = useState("");
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [followupAnswers, setFollowupAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  const applyResult = (res: IntakeResponse) => {
    setProfileId(res.profile_id);
    setResult(res);
    if (res.followups.length > 0) {
      setPhase("followups");
      announce(`We have ${res.followups.length} quick follow-up questions.`);
    } else {
      setPhase("review");
      announce("Here's what we understood. Review it, then plan your trip.");
    }
  };

  const fail = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    setPhase("error");
    announce("Something went wrong.", "assertive");
  };

  // Send the intake once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    announce("Checking your answers.");
    api
      .intake({ answers: buildAnswers(answers, others), consent_aggregate: false })
      .then(applyResult)
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the heading when the phase changes.
  useEffect(() => {
    headingRef.current?.focus();
  }, [phase]);

  const submitFollowups = () => {
    if (!result) return;
    setPhase("submitting");
    announce("Sending your answers.");
    api
      .followups(profileId, {
        answers: result.followups
          .filter((f) => followupAnswers[f.id]?.trim())
          .map((f) => ({ followup_id: f.id, answer: followupAnswers[f.id].trim() })),
      })
      .then(applyResult)
      .catch(fail);
  };

  const planTrip = async () => {
    setPhase("creating");
    announce("Building your trip. This can take up to a minute.", "assertive");
    try {
      await api.updateProfile(profileId, { consent_aggregate: consent });
      const trip = await api.createTrip({ profile_id: profileId });
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      fail(err);
    }
  };

  const wrap = "mx-auto w-full max-w-2xl px-6 py-12";
  const heading = "text-2xl font-bold tracking-tight focus:outline-none";

  if (phase === "submitting" || phase === "creating") {
    return (
      <div className={wrap} aria-busy="true">
        <h1 ref={headingRef} tabIndex={-1} className={heading}>
          {phase === "creating" ? "Building your trip…" : "One moment…"}
        </h1>
        <p className="mt-3 text-muted">
          {phase === "creating"
            ? "We're checking every place against your needs. This can take up to a minute."
            : "Reading your answers."}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={wrap}>
        <h1 ref={headingRef} tabIndex={-1} className={heading}>
          Something went wrong
        </h1>
        <p className="mt-3 text-muted">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-8 inline-flex h-12 items-center rounded-lg border border-border px-5 font-semibold text-foreground hover:bg-surface-muted"
        >
          Back to the questions
        </button>
      </div>
    );
  }

  if (phase === "followups" && result) {
    return (
      <div className={wrap}>
        <h1 ref={headingRef} tabIndex={-1} className={heading}>
          A few quick questions
        </h1>
        <p className="mt-2 text-muted">These help us get your plan right.</p>
        <form
          className="mt-8 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submitFollowups();
          }}
        >
          {result.followups.map((followup) => (
            <FollowupField
              key={followup.id}
              followup={followup}
              value={followupAnswers[followup.id] ?? ""}
              onChange={(v) => setFollowupAnswers((prev) => ({ ...prev, [followup.id]: v }))}
            />
          ))}
          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Review ("Here's what we understood")
  if (result) {
    return (
      <div className={wrap}>
        <h1 ref={headingRef} tabIndex={-1} className={heading}>
          Here&rsquo;s what we understood
        </h1>
        <p className="mt-3 text-lg">{result.dna.summary}</p>

        {result.assumptions.length > 0 && (
          <section aria-labelledby="assumptions-heading" className="mt-6">
            <h2 id="assumptions-heading" className="text-sm font-semibold text-muted">
              We also assumed
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {result.assumptions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <label className="mt-8 flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ accentColor: "var(--primary)" }}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span className="text-sm">
            Share my anonymized feedback — not my name or words — to help travelers with similar
            needs.
          </span>
        </label>

        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-12 items-center rounded-lg border border-border px-5 font-semibold text-foreground hover:bg-surface-muted"
          >
            Back
          </button>
          <button
            type="button"
            onClick={planTrip}
            className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Plan my trip
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function FollowupField({
  followup,
  value,
  onChange,
}: {
  followup: Followup;
  value: string;
  onChange: (value: string) => void;
}) {
  const options =
    followup.answer_type === "yes_no" ? ["yes", "no"] : (followup.options ?? []);

  return (
    <fieldset>
      <legend className="text-lg font-semibold">{followup.question}</legend>
      {followup.why && <p className="mt-1 text-sm text-muted">{followup.why}</p>}
      {followup.answer_type === "free_text" ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-3 w-full max-w-sm rounded-lg border border-border bg-surface px-4 py-3 text-base"
        />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium capitalize hover:bg-surface-muted has-[:checked]:border-primary has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name={followup.id}
                checked={value === option}
                onChange={() => onChange(option)}
                style={{ accentColor: "var(--primary)" }}
                className="h-5 w-5 shrink-0"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
