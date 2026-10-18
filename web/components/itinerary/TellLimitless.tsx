"use client";

import { useCallback, useRef, useState } from "react";
import { api, ApiError, type ReplanResult, type TripOut } from "@/lib/api";
import { speak, useCanSpeak, useSpeechInput } from "@/lib/speech";
import { useAnnounce } from "@/components/LiveRegion";

type Phase = "compose" | "sending" | "proposal" | "applying";

const changeLabel: Record<ReplanResult["changes"][number]["type"], string> = {
  replaced: "Changed",
  removed: "Removed",
  added: "Added",
  retimed: "New time",
  rest_added: "Rest added",
};

const button =
  "inline-flex h-12 items-center justify-center rounded-lg px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary-hover`;
const secondary = `${button} border border-border text-foreground hover:bg-surface-muted`;

/**
 * "Tell Limitless": the traveler says or types how it is going. The server proposes changes.
 * Nothing changes until the traveler chooses Apply. onApplied gets the new trip and the
 * version to go back to for Undo.
 */
export function TellLimitless({
  trip,
  onApplied,
}: {
  trip: TripOut;
  onApplied: (next: TripOut, undoVersion: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const announce = useAnnounce();
  const canSpeak = useCanSpeak();
  const [phase, setPhase] = useState<Phase>("compose");
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replan, setReplan] = useState<ReplanResult | null>(null);

  const onHeard = useCallback((heard: string) => {
    setText(heard);
    setUsedVoice(true);
  }, []);
  const mic = useSpeechInput(onHeard);

  const open = () => {
    setPhase("compose");
    setText("");
    setUsedVoice(false);
    setError(null);
    setReplan(null);
    dialog.current?.showModal();
    textBox.current?.focus();
  };

  const close = () => {
    mic.stop();
    if (canSpeak) window.speechSynthesis.cancel();
    dialog.current?.close();
  };

  const send = async () => {
    if (!text.trim()) {
      setError("Tell us how it is going first.");
      textBox.current?.focus();
      return;
    }
    mic.stop();
    setError(null);
    setPhase("sending");
    announce("Checking your plan.");
    try {
      const response = await api.feedback(trip.id, {
        transcript: text.trim(),
        input_mode: usedVoice ? "voice" : "text",
      });
      setReplan(response.replan);
      setPhase("proposal");
      announce(response.replan.message);
      if (usedVoice) speak(response.replan.message);
    } catch (err) {
      setPhase("compose");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      announce("We could not check your plan.", "assertive");
    }
  };

  const apply = async () => {
    if (!replan) return;
    setPhase("applying");
    try {
      const result = await api.applyVersion(trip.id, replan.version);
      onApplied(result.trip, trip.version);
      close();
    } catch (err) {
      setPhase("proposal");
      setError(err instanceof ApiError ? err.message : "We could not update your plan.");
      announce("We could not update your plan.", "assertive");
    }
  };

  return (
    <>
      <button type="button" onClick={open} className={primary}>
        Tell Limitless how it&rsquo;s going
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="tell-heading"
        className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/60"
        onClose={() => mic.stop()}
      >
        <div className="p-6">
          <h2 id="tell-heading" className="text-xl font-bold">
            Tell Limitless how it&rsquo;s going
          </h2>

          {(phase === "compose" || phase === "sending") && (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label htmlFor="tell-text" className="block text-sm font-medium">
                What happened? For example: &ldquo;The hills were too much and I need to sit
                down.&rdquo;
              </label>
              <textarea
                id="tell-text"
                ref={textBox}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                rows={4}
                maxLength={2000}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "tell-error" : undefined}
                className="mt-2 w-full rounded-lg border border-border bg-surface p-3 text-base"
              />
              {mic.supported && (
                <button
                  type="button"
                  onClick={mic.listening ? mic.stop : mic.start}
                  aria-pressed={mic.listening}
                  className={`${secondary} mt-3`}
                >
                  <span aria-hidden="true">{mic.listening ? "■" : "🎤"}</span>
                  <span className="ml-2">{mic.listening ? "Stop listening" : "Speak instead"}</span>
                </button>
              )}
              {mic.listening && (
                <p className="mt-2 text-sm text-muted" role="status">
                  Listening… You can edit the text before you send it.
                </p>
              )}
              {(error || mic.error) && (
                <p id="tell-error" className="mt-3 text-sm font-medium text-danger">
                  {error ?? mic.error}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="submit" disabled={phase === "sending"} className={primary}>
                  {phase === "sending" ? "Checking your plan…" : "Send"}
                </button>
                <button type="button" onClick={close} className={secondary}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {(phase === "proposal" || phase === "applying") && replan && (
            <div className="mt-4" aria-busy={phase === "applying"}>
              <p>{replan.message}</p>
              {canSpeak && (
                <button
                  type="button"
                  onClick={() => speak(replan.message)}
                  className="mt-2 text-sm font-medium text-primary underline underline-offset-4"
                >
                  Read this aloud
                </button>
              )}
              {replan.changes.length > 0 && (
                <>
                  <h3 className="mt-5 font-semibold">Proposed changes</h3>
                  <ul className="mt-2 space-y-2">
                    {replan.changes.map((change, i) => (
                      <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
                        <span className="font-semibold">
                          {changeLabel[change.type]} · Day {change.day_index + 1}:
                        </span>{" "}
                        {change.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
              <div className="mt-6 flex flex-wrap gap-3">
                {replan.changed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void apply()}
                      disabled={phase === "applying"}
                      className={primary}
                    >
                      {phase === "applying" ? "Updating…" : "Apply"}
                    </button>
                    <button type="button" onClick={close} className={secondary}>
                      Keep my plan
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={close} className={primary}>
                    Close
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
