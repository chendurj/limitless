"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Voice input and read-aloud with the browser's Web Speech API. No keys, no server.
// Speech recognition is in Chrome, Edge and Safari. Where it is missing, `supported` is false
// and the page hides the microphone button. The traveler can always type instead.

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
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

/** True only in the browser, when speech recognition exists. False during server render. */
function useIsSupported(check: () => boolean): boolean {
  return useSyncExternalStore(noSubscribe, check, () => false);
}

/**
 * Speech to text. start() listens until the traveler stops talking or calls stop().
 * onText gets the full transcript so far, so the text box always shows what was heard.
 */
export function useSpeechInput(onText: (text: string) => void) {
  const supported = useIsSupported(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onText);

  useEffect(() => {
    latest.current = onText;
  }, [onText]);

  useEffect(() => () => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("");
      latest.current(text);
    };
    r.onerror = (event) =>
      setError(
        event.error === "not-allowed"
          ? "Microphone access is off. You can type instead."
          : "We could not hear that. You can try again or type instead.",
      );
    r.onend = () => setListening(false);
    recognition.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, error, start, stop };
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
