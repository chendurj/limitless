"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { validateTripDates } from "@/lib/trip-dates";
import {
  intakeScreens,
  previousTripNotes,
  visibleScreens,
  isVisible,
  type AnswerMap,
  type IntakeScreen,
} from "@/lib/intakeQuestions";
import { useAnnounce } from "@/components/LiveRegion";
import { QuestionField, type FieldValue } from "@/components/QuestionField";
import { IntakeSubmit } from "@/components/IntakeSubmit";
import { useGuest } from "@/components/GuestGate";

const DRAFT_VERSION = 4;

type Answers = Record<string, FieldValue>;

// The branching engine only reads simple values, so drop the must-nice object.
function toAnswerMap(answers: Answers): AnswerMap {
  const map: AnswerMap = {};
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === "string" || Array.isArray(value)) map[key] = value;
  }
  return map;
}

function isEmpty(value: FieldValue | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return value.must.length === 0 && value.nice.length === 0;
}

type Draft = { answers: Answers; others: Record<string, string>; index: number };
const noSubscribe = () => () => {};

function readDraft(storageKey: string): Draft {
  // Storage is untrusted and can outlive a questionnaire release. Restore only
  // currently valid answer shapes; old hidden answers must not become new requirements.
  const draft: Draft = { answers: {}, others: {}, index: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved || typeof saved !== "object") return draft;
    for (const question of intakeScreens.flatMap(screen => screen.questions)) {
      const value = saved.answers?.[question.id];
      const allowed = new Set(question.options?.map(option => option.value));
      if (["text", "date", "number"].includes(question.inputType) && typeof value === "string") draft.answers[question.id] = question.inputType === "date" ? value.trim() : value;
      else if (question.inputType === "single" && typeof value === "string" && allowed.has(value)) draft.answers[question.id] = value;
      else if (question.inputType === "multi" && Array.isArray(value)) draft.answers[question.id] = [...new Set(value.filter((entry: unknown): entry is string => typeof entry === "string" && allowed.has(entry)))];
      else if (question.inputType === "must-nice" && value && Array.isArray(value.must) && Array.isArray(value.nice)) {
        const must = [...new Set<string>(value.must.filter((entry: unknown) => typeof entry === "string" && allowed.has(entry)))];
        const nice = [...new Set<string>(value.nice.filter((entry: unknown) => typeof entry === "string" && allowed.has(entry) && !must.includes(entry)))];
        draft.answers[question.id] = { must, nice };
      }
      if (question.allowOther && typeof saved.others?.[question.id] === "string") draft.others[question.id] = saved.others[question.id];
    }
    if (typeof saved.answers?.end_date === "string") draft.answers.end_date = saved.answers.end_date.trim();
    if (saved.version !== DRAFT_VERSION) {
      const notes = previousTripNotes(saved.answers ?? {});
      if (notes) draft.others.requirements = [draft.others.requirements, notes].filter(Boolean).join(" ");
    }
    // Older layouts used different step positions. Keep answers, restart at step one.
    if (saved.version === DRAFT_VERSION && Number.isInteger(saved.index) && saved.index >= 0) draft.index = saved.index;
  } catch { /* A corrupt or unavailable draft must not block the form. */ }
  return draft;
}

export function IntakeWizard() {
  const guest = useGuest();
  const storageKey = `limitless_intake_${guest.id}`;
  // Mount the stateful form only after hydration. Its lazy initializer can read
  // browser storage before the first persistence effect, including in Strict Mode.
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  return ready ? <IntakeWizardForm key={storageKey} storageKey={storageKey} /> : <p role="status" className="px-6 py-12">Loading your questions…</p>;
}

function IntakeWizardForm({ storageKey }: { storageKey: string }) {
  const announce = useAnnounce();
  const [draft] = useState(() => readDraft(storageKey));
  const [answers, setAnswers] = useState<Answers>(draft.answers);
  const [others, setOthers] = useState<Record<string, string>>(draft.others);
  const [index, setIndex] = useState(draft.index);
  const [done, setDone] = useState(false);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [dateError, setDateError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: DRAFT_VERSION, answers, others, index }));
    } catch { /* Storage may be full or blocked; the form still works. */ }
  }, [answers, others, index, storageKey]);

  const answerMap = useMemo(() => toAnswerMap(answers), [answers]);
  const screens = useMemo(() => visibleScreens(answerMap), [answerMap]);
  // A changed access need can remove later steps while an old draft still points there.
  const safeIndex = Math.max(0, Math.min(index, screens.length - 1));
  const current: IntakeScreen | undefined = screens[safeIndex];

  // Move focus to the step heading and announce each change.
  useEffect(() => {
    headingRef.current?.focus();
    if (done) {
      announce("All done. Here's what we understood.", "assertive");
    } else if (current) {
      announce(`Step ${safeIndex + 1} of ${screens.length}: ${current.title}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, done]);

  const questionsOn = (screen: IntakeScreen) =>
    screen.questions.filter((q) => isVisible(q, answerMap));

  const setAnswer = (id: string, value: FieldValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setInvalidIds((prev) => prev.filter((x) => x !== id && !(id === "end_date" && x === "start_date")));
    if (id === "start_date" || id === "end_date") setDateError("");
  };
  const setOther = (id: string, text: string) =>
    setOthers((prev) => ({ ...prev, [id]: text }));

  const goNext = () => {
    if (!current) return;
    const required = questionsOn(current).filter(
      (q) => !q.optional && q.inputType !== "must-nice",
    );
    const missing = questionsOn(current).filter(q => {
      const value = answers[q.id];
      if (q.dateRange) {
        const dates = validateTripDates(typeof value === "string" ? value : "", typeof answers.end_date === "string" ? answers.end_date : "", new Date().toLocaleDateString("en-CA"));
        if (dates.error) { setDateError(dates.error); return true; }
      }
      if (!q.dateRange && q.inputType === "date" && typeof value === "string" && value.trim()) {
        const date = new Date(value);
        const today = new Date().toLocaleDateString("en-CA");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < today) return true;
      }
      if (q.inputType === "number" && typeof value === "string" && value.trim()) {
        const n = Number(value);
        if (!Number.isSafeInteger(n) || n < (q.id === "party_size" ? 1 : 0)) return true;
      }
      return required.includes(q) && isEmpty(value) && !(q.allowOther && others[q.id]?.trim());
    }).map(q => q.id);
    if (missing.length > 0) {
      setInvalidIds(missing);
      announce("Please answer the highlighted question before continuing.", "assertive");
      return;
    }
    setInvalidIds([]);
    if (safeIndex >= screens.length - 1) setDone(true);
    else setIndex(safeIndex + 1);
  };

  const goBack = () => {
    setInvalidIds([]);
    if (done) {
      setDone(false);
      return;
    }
    if (safeIndex > 0) setIndex(safeIndex - 1);
  };

  // After the last step, hand the answers to the API submit + review flow.
  if (done) {
    // The trip exists now, so the next "Plan a trip" starts a new form at step one.
    const clearDraft = () => {
      try { localStorage.removeItem(storageKey); } catch { /* Storage may be blocked. */ }
    };
    return <IntakeSubmit answers={answers} others={others} onBack={() => setDone(false)} onCreated={clearDraft} />;
  }

  if (!current) return null;

  const progress = Math.round(((safeIndex + 1) / screens.length) * 100);
  const isLast = safeIndex >= screens.length - 1;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <p className="text-sm font-medium text-muted">
        Step {safeIndex + 1} of {screens.length}
      </p>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-bold tracking-tight focus:outline-none"
      >
        {current.title}
      </h1>
      {current.description && <p className="mt-2 text-muted">{current.description}</p>}

      <form
        className="mt-8 space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          goNext();
        }}
      >
        {questionsOn(current).map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            hidePrompt={current.title === q.prompt}
            value={answers[q.id]}
            otherValue={others[q.id] ?? ""}
            invalid={invalidIds.includes(q.id)}
            endDateValue={typeof answers.end_date === "string" ? answers.end_date : ""}
            onEndDateChange={value => setAnswer("end_date", value)}
            dateError={q.dateRange ? dateError : undefined}
            onChange={(v) => setAnswer(q.id, v)}
            onOtherChange={(t) => setOther(q.id, t)}
          />
        ))}

        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={goBack}
            disabled={safeIndex === 0}
            className="inline-flex h-12 items-center rounded-lg border border-border px-5 font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="submit"
            className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </form>

      <p className="mt-6 text-sm">
        <Link href="/" className="text-primary underline underline-offset-4">
          Save and exit
        </Link>
      </p>
    </div>
  );
}
