"use client";

import type { ReactNode } from "react";
import type { IntakeQuestion } from "@/lib/intakeQuestions";
import { QuestionVoiceInput } from "@/components/QuestionVoiceInput";

export type MustNice = { must: string[]; nice: string[] };
export type FieldValue = string | string[] | MustNice;

type Props = {
  question: IntakeQuestion;
  value: FieldValue | undefined;
  otherValue: string;
  invalid: boolean;
  hidePrompt?: boolean;
  onChange: (value: FieldValue) => void;
  onOtherChange: (text: string) => void;
};

// A tappable chip wrapping a real checkbox/radio, so the native control carries
// the state for screen readers and the border/fill shows it visually (not color
// alone). Keyboard focus uses the global focus-visible ring.
const chip =
  "flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium cursor-pointer transition-colors hover:bg-surface-muted has-[:checked]:border-primary has-[:checked]:bg-accent-soft";

export function QuestionField({
  question,
  value,
  otherValue,
  invalid,
  hidePrompt = false,
  onChange,
  onOtherChange,
}: Props) {
  const helpId = question.help ? `${question.id}-help` : undefined;
  const errorId = invalid ? `${question.id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  const help = question.help ? (
    <p id={helpId} className="mt-1 text-sm text-muted">
      {question.help}
    </p>
  ) : null;

  const error = invalid ? (
    <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-danger">
      {question.inputType === "number" ? `Enter a whole number of ${question.id === "party_size" ? 1 : 0} or more.` : "Please answer this to continue."}
    </p>
  ) : null;

  let control: ReactNode;

  // Free-text, number, and date all use a single labelled input.
  if (
    question.inputType === "text" ||
    question.inputType === "number" ||
    question.inputType === "date"
  ) {
    const current = typeof value === "string" ? value : "";
    control = (
      <div>
        <label htmlFor={question.id} className="block text-lg font-semibold">
          {question.prompt}
        </label>
        {help}
        <input
          id={question.id}
          type={question.inputType}
          value={current}
          min={question.inputType === "number" ? question.id === "party_size" ? 1 : 0 : undefined}
          step={question.inputType === "number" ? 1 : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className="mt-3 w-full max-w-sm rounded-lg border border-border bg-surface px-4 py-3 text-base"
        />
      </div>
    );
  }

  // Must-have / nice-to-have: each feature gets a three-way choice.
  else if (question.inputType === "must-nice") {
    const mn: MustNice =
      value && !Array.isArray(value) && typeof value !== "string"
        ? value
        : { must: [], nice: [] };

    const setLevel = (feature: string, level: "no" | "nice" | "must") => {
      const must = mn.must.filter((f) => f !== feature);
      const nice = mn.nice.filter((f) => f !== feature);
      if (level === "must") must.push(feature);
      if (level === "nice") nice.push(feature);
      onChange({ must, nice });
    };

    control = (
      <fieldset aria-describedby={describedBy}>
        <legend className={hidePrompt ? "sr-only" : "text-lg font-semibold"}>{question.prompt}</legend>
        {help}
        <ul className="mt-4 space-y-2">
          {question.options?.map((opt, index) => {
            const level = mn.must.includes(opt.value)
              ? "must"
              : mn.nice.includes(opt.value)
                ? "nice"
                : "no";
            return (
              <li
                key={opt.value}
                className="rounded-lg border border-border bg-surface p-3 sm:flex sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium"><span className="text-muted">{index + 1}. </span>{opt.label}</span>
                <div
                  role="radiogroup"
                  aria-label={opt.label}
                  className="mt-2 flex flex-wrap gap-4 sm:mt-0"
                >
                  {(["no", "nice", "must"] as const).map((lvl) => (
                    <label key={lvl} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name={`${question.id}-${opt.value}`}
                        checked={level === lvl}
                        onChange={() => setLevel(opt.value, lvl)}
                        style={{ accentColor: "var(--primary)" }}
                        className="h-4 w-4"
                      />
                      {lvl === "no"
                        ? "Not needed"
                        : lvl === "nice"
                          ? "Nice to have"
                          : "Must have"}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>
    );
  }

  // Single (radio) or multi (checkbox) option groups.
  else {
    const isMulti = question.inputType === "multi";
    const selected: string[] = Array.isArray(value)
      ? value
      : typeof value === "string" && value
        ? [value]
        : [];

    const toggle = (optValue: string) => {
      if (isMulti) {
        onChange(
          selected.includes(optValue)
            ? selected.filter((v) => v !== optValue)
            : [...selected, optValue],
        );
      } else {
        onChange(optValue);
      }
    };

    control = (
      <fieldset aria-describedby={describedBy}>
        <legend className={hidePrompt ? "sr-only" : "text-lg font-semibold"}>{question.prompt}</legend>
        {help}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options?.map((opt, index) => (
            <label key={opt.value} className={chip}>
              <input
                type={isMulti ? "checkbox" : "radio"}
                name={question.id}
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                style={{ accentColor: "var(--primary)" }}
                className="h-5 w-5 shrink-0"
              />
              <span><span className="text-muted">{index + 1}. </span>{opt.label}</span>
            </label>
          ))}
        </div>

      </fieldset>
    );
  }

  return (
    <div data-question-id={question.id}>
      {control}
        {question.allowOther && (
          <div className="mt-3">
            <label
              htmlFor={`${question.id}-other`}
              className="block text-sm font-medium text-muted"
            >
              Something else
            </label>
            <input
              id={`${question.id}-other`}
              type="text"
              value={otherValue}
              onChange={(e) => onOtherChange(e.target.value)}
              className="mt-1 w-full max-w-sm rounded-lg border border-border bg-surface px-4 py-2 text-base"
            />
          </div>
        )}
      {error}
      {/* One microphone per question. Words that match no option can go to "Something else". */}
      <QuestionVoiceInput
        question={question}
        value={value}
        onChange={onChange}
        onOther={question.allowOther ? onOtherChange : undefined}
      />
    </div>
  );
}
