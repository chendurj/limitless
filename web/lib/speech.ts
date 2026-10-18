"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AudioRecorder, canRecordAudio, type RecordingState } from "./audio-recorder";

const noSubscribe = () => () => {};
let cancelActiveInput: (() => void) | null = null;
function useIsSupported(check: () => boolean): boolean {
  return useSyncExternalStore(noSubscribe, check, () => false);
}

/** Record microphone audio, then transcribe on the server when Stop is chosen. */
export function useSpeechInput(onText: (text: string) => void) {
  const supported = useIsSupported(canRecordAudio);
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<AudioRecorder | null>(null);
  const latest = useRef(onText);
  useEffect(() => { latest.current = onText; }, [onText]);

  const cancel = useCallback(function cancelInput() {
    if (cancelActiveInput === cancelInput) cancelActiveInput = null;
    recorder.current?.cancel();
  }, []);
  useEffect(() => () => {
    if (cancelActiveInput === cancel) cancelActiveInput = null;
    recorder.current?.cancel(false);
    recorder.current = null;
    setState("idle");
  }, [cancel]);

  const start = useCallback(() => {
    if (!canRecordAudio()) {
      setError("Microphone recording needs HTTPS or localhost and a supported browser. You can still type.");
      return;
    }
    if (cancelActiveInput === cancel) return;
    cancelActiveInput?.();
    cancelActiveInput = cancel;
    recorder.current ??= new AudioRecorder({
      state: next => {
        if (next === "idle" && cancelActiveInput === cancel) cancelActiveInput = null;
        setState(next);
      },
      error: setError,
      text: text => latest.current(text),
    });
    void recorder.current.start();
  }, [cancel]);
  const stop = useCallback(() => recorder.current?.stop(), []);
  return { supported, listening: state === "recording", starting: state === "starting", processing: state === "transcribing", error, start, stop, cancel };
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
  // Chrome can leave synthesis paused after an interrupted utterance. Resume on this user gesture.
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utterance);
}

export function useCanSpeak(): boolean {
  return useIsSupported(canSpeak);
}
