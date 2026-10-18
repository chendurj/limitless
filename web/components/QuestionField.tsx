"use client";

import { useState, type ReactNode } from "react";
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
  endDateValue?: string;
  onEndDateChange?: (value: string) => void;
  dateError?: string;
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
  endDateValue = "",
  onEndDateChange,
  dateError,
  onChange,
  onOtherChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const selectedValues = Array.isArray(value) ? value : typeof value === "object" && value ? [...value.must, ...value.nice] : [value];
  const optionRows = (question.options ?? []).map((option, index) => ({ option, index })).filter(({ option, index }) => expanded || index < (question.initialOptions ?? Infinity) || selectedValues.includes(option.value));
  const moreOptions = question.initialOptions && (question.options?.length ?? 0) > question.initialOptions ? (
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(previous => !previous)} className="mt-3 min-h-11 text-sm font-semibold text-primary underline underline-offset-4">
      {expanded ? "Fewer options" : "More options"}
    </button>
  ) : null;
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
      {dateError || (question.inputType === "date" ? "Choose today or a future date, or leave it blank." : question.inputType === "number" ? `Enter a whole number of ${question.id === "party_size" ? 1 : 0} or more.` : "Please answer this to continue.")}
    </p>
  ) : null;

  let control: ReactNode;

  // A complete trip range stays on one step, with a label for each calendar.
  if (question.dateRange) {
    control = <fieldset aria-describedby={describedBy}>
      <legend className={hidePrompt ? "sr-only" : "text-lg font-semibold"}>{question.prompt}</legend>
      {help}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={question.id} className="block font-semibold">Start date</label>
          <input id={question.id} type="date" value={typeof value === "string" ? value : ""} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={event => onChange(event.target.value)} className="mt-2 min-h-12 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-base" />
        </div>
        <div><label htmlFor="end_date" className="block font-semibold">End date (return)</label>
          <input id="end_date" type="date" value={endDateValue} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={event => onEndDateChange?.(event.target.value)} className="mt-2 min-h-12 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-base" />
        </div>
      </div>
    </fieldset>;
  }
  else if (
    question.inputType === "text" ||
    question.inputType === "number" ||
    question.inputType === "date"
  ) {
    const current = typeof value === "string" ? value : "";
    control = (
      <div>
        <label htmlFor={question.id} className={hidePrompt ? "sr-only" : "block text-lg font-semibold"}>
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
          {optionRows.map(({ option: opt, index }) => {
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
        {moreOptions}
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
          {optionRows.map(({ option: opt, index }) => (
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
        {moreOptions}
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
              {question.id === "requirements" ? "Other needs or things to avoid" : "Something else"}
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
      {/* Each date has its own voice input. Other answers use one microphone. */}
      <QuestionVoiceInput
        question={question.dateRange ? { ...question, prompt: "Start date" } : question}
        speakLabel={question.dateRange ? "Speak start date" : undefined}
        value={value}
        onChange={onChange}
        onOther={question.allowOther ? onOtherChange : undefined}
      />
      {question.dateRange && <QuestionVoiceInput speakLabel="Speak end date" question={{ ...question, id: "end_date", prompt: "End date", dateRange: false }} value={endDateValue} onChange={value => { if (typeof value === "string") onEndDateChange?.(value); }} />}
    </div>
  );
}
