"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Voice input and read-aloud with the browser's Web Speech API. No app API keys
// or app-server audio uploads. The browser may use a remote recognition service.
// Browser support varies. Where recognition is missing, `supported` is false.
// The traveler can always type instead.

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};
// Several questionnaire fields can offer dictation, but only one may listen.
let cancelActiveInput: (() => void) | null = null;

/** True only in the browser, when speech recognition exists. False during server render. */
function useIsSupported(check: () => boolean): boolean {
  return useSyncExternalStore(noSubscribe, check, () => false);
}

/**
 * Speech to text. With continuous=true, pauses do not intentionally end dictation;
 * the traveler calls stop() to finish (the browser may still end the session).
 * onText gets the full transcript so far, so the text box always shows what was heard.
 */
export function useSpeechInput(onText: (text: string) => void, continuous = false) {
  const supported = useIsSupported(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onText);

  useEffect(() => {
    latest.current = onText;
  }, [onText]);

  // Cancel without accepting late results, e.g. when clearing or sending a draft.
  const cancel = useCallback(function cancelInput() {
    if (cancelActiveInput === cancelInput) cancelActiveInput = null;
    const r = recognition.current;
    recognition.current = null;
    if (r) {
      r.onresult = r.onerror = r.onend = null;
      r.abort();
    }
    setListening(false);
    setError(null);
  }, []);

  useEffect(() => () => {
    if (cancelActiveInput === cancel) cancelActiveInput = null;
    const r = recognition.current;
    recognition.current = null;
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    r.abort();
    setListening(false);
  }, [cancel]);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    cancelActiveInput?.();
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = continuous;
    r.onresult = (event) => {
      if (recognition.current !== r) return;
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      latest.current(text);
    };
    r.onerror = (event) => {
      if (recognition.current !== r) return;
      const errors: Record<string, string> = {
        "not-allowed": "Microphone access is off. Allow it in your browser, or type instead.",
        "service-not-allowed": "Voice input is not allowed in this browser. You can type instead.",
        "audio-capture": "We couldn't access a microphone. Check that one is connected, or type instead.",
        "no-speech": "We didn't hear any speech. Try again when you're ready, or type instead.",
        network: "Voice input couldn't connect. Check your connection, or type instead.",
      };
      setError(errors[event.error] ?? "We could not hear that. You can try again or type instead.");
      setListening(false);
      recognition.current = null;
      if (cancelActiveInput === cancel) cancelActiveInput = null;
      r.onresult = r.onerror = r.onend = null;
      r.abort();
    };
    r.onend = () => {
      if (recognition.current !== r) return;
      recognition.current = null;
      if (cancelActiveInput === cancel) cancelActiveInput = null;
      setListening(false);
    };
    recognition.current = r;
    cancelActiveInput = cancel;
    setError(null);
    setListening(true);
    try { r.start(); }
    catch {
      r.onresult = r.onerror = r.onend = null;
      recognition.current = null;
      if (cancelActiveInput === cancel) cancelActiveInput = null;
      setListening(false);
      setError("Voice input couldn't start. Please try again, or type instead.");
    }
  }, [continuous, cancel]);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, error, start, stop, cancel };
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Read text aloud. Stops anything that is already being read. */
export function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

export function useCanSpeak(): boolean {
  return useIsSupported(canSpeak);
}
