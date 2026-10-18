"use client";

import { useState } from "react";
import type { IntakeQuestion } from "@/lib/intakeQuestions";
import type { FieldValue } from "@/components/QuestionField";
import { parseVoiceAnswer, voiceAnswerHelp } from "@/lib/questionnaire-voice";
import { useSpeechInput } from "@/lib/speech";

export function QuestionVoiceInput({ question, value, onChange }: {
  question: IntakeQuestion;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [applied, setApplied] = useState(false);
  const mic = useSpeechInput(heard => { setTranscript(heard.slice(0, 2000)); setApplied(false); }, true);
  const parsed = parseVoiceAnswer(question, transcript, value);
  const id = `voice-${question.id}`;

  function toggle() {
    if (mic.listening) mic.stop();
    else { setOpen(true); setApplied(false); mic.start(); }
  }

  return (
    <div className="mt-3">
      <button type="button" disabled={!mic.supported} onClick={toggle} aria-pressed={mic.listening} aria-label={`${mic.listening ? "Stop microphone" : "Speak answer"}: ${question.prompt}`} aria-describedby={`${id}-help`} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${mic.listening ? "border-danger text-danger" : "border-border text-primary hover:bg-surface-muted"}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>
        {mic.listening ? "Stop microphone" : "Speak answer"}
      </button>
      <p id={`${id}-help`} className="mt-1 text-xs text-muted">{mic.supported ? "Optional. Review what we heard before using it. You can also use the fields above." : "Voice input isn't available in this browser. Use the fields above."}</p>
      {open && <div className="mt-3 rounded-lg border border-border bg-surface-muted p-4">
        <p className="text-sm text-muted">{voiceAnswerHelp(question)}</p>
        <label htmlFor={id} className="mt-3 block text-sm font-semibold">What we heard for: {question.prompt}</label>
        <textarea id={id} rows={2} value={transcript} readOnly={mic.listening} maxLength={2000} onChange={event => { setTranscript(event.target.value); setApplied(false); }} className="mt-2 w-full rounded-lg border border-border bg-surface p-3 text-base" />
        <p role="status" className="mt-2 text-sm">{mic.listening ? "Listening. When you're done, choose Stop microphone." : applied ? "Answer added. Check the fields above before continuing." : transcript ? "value" in parsed ? `Ready to use: ${parsed.summary}` : parsed.error : "Speak your answer, or type it here."}</p>
        {mic.error && <p role="alert" className="mt-2 text-sm text-danger">{mic.error}</p>}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled={mic.listening || !("value" in parsed) || applied} onClick={() => {
            if (!("value" in parsed)) return;
            mic.cancel(); onChange(parsed.value); setApplied(true);
          }} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Use this answer</button>
          <button type="button" onClick={() => { mic.cancel(); setOpen(false); setTranscript(""); setApplied(false); }} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm">Cancel voice answer</button>
        </div>
      </div>}
    </div>
  );
}
