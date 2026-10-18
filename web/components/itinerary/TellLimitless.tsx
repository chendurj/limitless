"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ReplanResult, type TripOut } from "@/lib/api";
import { speak, useCanSpeak, useSpeechInput } from "@/lib/speech";
import { useAnnounce } from "@/components/LiveRegion";
import { Spinner } from "@/components/Spinner";

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
  initiallyOpen = false,
  triggerLabel,
}: {
  trip: TripOut;
  onApplied: (next: TripOut, undoVersion: number) => void;
  initiallyOpen?: boolean;
  triggerLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const announce = useAnnounce();
  const operation = useRef<"send" | "apply" | null>(null);
  const requestRun = useRef(0);
  useEffect(() => () => { requestRun.current++; operation.current = null; }, []);
  const canSpeak = useCanSpeak();
  const [phase, setPhase] = useState<Phase>("compose");
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replan, setReplan] = useState<ReplanResult | null>(null);

  const onHeard = useCallback((heard: string) => {
    setText(current => [current.trim(), heard.trim()].filter(Boolean).join(" ").slice(0, 2000));
    setUsedVoice(true);
  }, []);
  const mic = useSpeechInput(onHeard);
  const micBusy = mic.starting || mic.listening || mic.processing;

  useEffect(() => {
    if (initiallyOpen && !dialog.current?.open) {
      dialog.current?.showModal();
      textBox.current?.focus();
    }
  }, [initiallyOpen]);

  const open = () => {
    requestRun.current++;
    operation.current = null;
    setPhase("compose");
    setText("");
    setUsedVoice(false);
    setError(null);
    setReplan(null);
    dialog.current?.showModal();
    textBox.current?.focus();
  };

  const close = () => {
    requestRun.current++;
    operation.current = null;
    mic.cancel();
    if (canSpeak) window.speechSynthesis.cancel();
    dialog.current?.close();
  };

  const send = async () => {
    if (operation.current || micBusy) return;
    if (!text.trim()) {
      setError("Describe what you would like to change first.");
      textBox.current?.focus();
      return;
    }
    operation.current = "send";
    const run = ++requestRun.current;
    mic.cancel();
    setError(null);
    setPhase("sending");
    announce("Checking your plan.");
    try {
      const response = await api.feedback(trip.id, {
        transcript: text.trim(),
        input_mode: usedVoice ? "voice" : "text",
      });
      if (run !== requestRun.current) return;
      setReplan(response.replan);
      setPhase("proposal");
      announce(response.replan.message);

    } catch (err) {
      if (run !== requestRun.current) return;
      setPhase("compose");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      announce("We could not check your plan.", "assertive");
    } finally {
      if (run === requestRun.current) operation.current = null;
    }
  };

  const apply = async () => {
    if (!replan || operation.current) return;
    operation.current = "apply";
    const run = ++requestRun.current;
    setPhase("applying");
    try {
      const result = await api.applyVersion(trip.id, replan.version);
      if (run !== requestRun.current) return;
      onApplied(result.trip, trip.version);
      close();
    } catch (err) {
      if (run !== requestRun.current) return;
      setPhase("proposal");
      setError(err instanceof ApiError ? err.message : "We could not update your plan.");
      announce("We could not update your plan.", "assertive");
    } finally {
      if (run === requestRun.current) operation.current = null;
    }
  };

  return (
    <>
      <button type="button" onClick={open} className={primary}>
        {triggerLabel ?? <>Edit with AI</>}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="tell-heading"
        className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/60"
        onCancel={event => { if (operation.current === "apply") event.preventDefault(); else { requestRun.current++; operation.current = null; mic.cancel(); } }}
        onClose={() => { if (!dialog.current?.open) { requestRun.current++; operation.current = null; mic.cancel(); } }}
      >
        <div className="p-6">
          <h2 id="tell-heading" className="text-xl font-bold">
            Edit with AI
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
                What would you like to change?
              </label>
              <textarea
                id="tell-text"
                ref={textBox}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder="For example: Less walking and more breaks, more museums, or try different stops."
                rows={4}
                maxLength={2000}
                readOnly={phase === "sending" || micBusy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "tell-error" : undefined}
                className="mt-2 w-full rounded-lg border border-border bg-surface p-3 text-base"
              />
              <p className="mt-2 text-xs text-muted">Type or speak, then review the changes before saving. Completed and locked stops stay in place.</p>
              {mic.supported && (
                <button
                  type="button"
                  onClick={mic.starting ? mic.cancel : mic.listening ? mic.stop : mic.start}
                  disabled={phase === "sending" || mic.processing}
                  aria-pressed={mic.listening}
                  className={`${secondary} mt-3`}
                >
                  <span aria-hidden="true">{mic.listening ? "■" : "🎤"}</span>
                  <span className="ml-2">{mic.starting ? "Cancel microphone" : mic.processing ? "Turning speech into text…" : mic.listening ? "Stop recording" : "Speak"}</span>
                </button>
              )}
              {micBusy && (
                <p className="mt-2 text-sm text-muted" role="status">
                  {mic.starting ? "Allow microphone access in your browser." : mic.processing ? "Turning your speech into text…" : "Recording… Choose Stop recording to turn your speech into text."}
                </p>
              )}
              {(error || mic.error) && (
                <p id="tell-error" role="alert" className="mt-3 text-sm font-medium text-danger">
                  {error ?? mic.error}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="submit" disabled={phase === "sending" || micBusy} className={primary}>
                  {phase === "sending" ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size={16} />
                      Checking your plan…
                    </span>
                  ) : (
                    "Update my plan"
                  )}
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
              {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" disabled={phase === "applying"} onClick={() => { if (canSpeak) window.speechSynthesis.cancel(); setPhase("compose"); setError(null); textBox.current?.focus(); }} className={secondary}>Change request</button>
                {replan.changed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void apply()}
                      disabled={phase === "applying"}
                      className={primary}
                    >
                      {phase === "applying" ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner size={16} />
                          Updating…
                        </span>
                      ) : (
                        "Save changes"
                      )}
                    </button>
                    <button type="button" onClick={close} disabled={phase === "applying"} className={secondary}>
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
