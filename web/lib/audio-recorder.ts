export type RecordingState = 'idle' | 'starting' | 'recording' | 'transcribing';
type Callbacks = { state: (state: RecordingState) => void; error: (message: string | null) => void; text: (text: string) => void };
const MAX_BYTES = 8 * 1024 * 1024;

export function canRecordAudio() {
  return typeof window !== 'undefined' && window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined';
}

// Recording is independent of the browser's network-based SpeechRecognition
// service. Only Stop uploads audio; Cancel, navigation, and unmount discard it.
export class AudioRecorder {
  private callbacks: Callbacks;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private permissionTimer: ReturnType<typeof setTimeout> | null = null;
  private run = 0;
  // Each recording owns a run number. Late permission results and fetch responses
  // from cancelled recordings cannot populate a different question or trip edit.
  private state: RecordingState = 'idle';

  constructor(callbacks: Callbacks) { this.callbacks = callbacks; }
  private setState(state: RecordingState) { this.state = state; this.callbacks.state(state); }
  private releaseTracks() {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
  }
  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.permissionTimer) clearTimeout(this.permissionTimer);
    this.timer = this.permissionTimer = null;
  }
  cancel(notify = true) {
    this.run++;
    this.clearTimers();
    this.abort?.abort(); this.abort = null;
    if (this.recorder) {
      this.recorder.ondataavailable = this.recorder.onstop = this.recorder.onerror = null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      this.recorder = null;
    }
    this.releaseTracks();
    this.state = 'idle';
    if (notify) { this.callbacks.state('idle'); this.callbacks.error(null); }
  }
  private fail(message: string) { this.cancel(); this.callbacks.error(message); }
  stop() {
    if (this.state !== 'recording' || !this.recorder) return;
    this.clearTimers();
    this.setState('transcribing');
    this.recorder.stop();
    // Stop the hardware immediately, before waiting for transcription.
    this.releaseTracks();
  }
  async start() {
    if (this.state !== 'idle') return;
    if (!canRecordAudio()) { this.callbacks.error('Microphone recording needs HTTPS or localhost and a supported browser. You can still type.'); return; }
    const run = ++this.run;
    this.callbacks.error(null);
    this.setState('starting');
    this.permissionTimer = setTimeout(() => this.fail('Microphone permission is taking a while. Allow it in your browser, then try again.'), 30000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (run !== this.run) { stream.getTracks().forEach(track => track.stop()); return; }
      this.clearTimers(); this.stream = stream;
      stream.getTracks().forEach(track => { track.onended = () => this.fail('Microphone access ended. Please try again.'); });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = event => {
        if (run !== this.run || !event.data.size) return;
        size += event.data.size;
        if (size > MAX_BYTES) { this.fail('That recording is too long. Please record a shorter answer.'); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => { if (run === this.run) this.fail('The microphone could not record. Please try again.'); };
      recorder.onstop = async () => {
        // MediaRecorder delivers its final audio chunk before this event. Upload
        // only after collecting it, and release the hardware before network work.
        if (run !== this.run) return;
        this.releaseTracks();
        this.recorder = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) { this.fail('The recording was empty. Please speak and try again.'); return; }
        this.setState('transcribing');
        this.abort = new AbortController();
        try {
          const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(50000)]) });
          const data = await response.json();
          if (run !== this.run) return;
          if (!response.ok) throw new Error(data.error || 'We could not hear that. Please try again.');
          if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('We did not hear any words. Please try again.');
          this.abort = null; this.clearTimers();
          this.setState('idle'); this.callbacks.text(data.text);
        } catch (cause) {
          if (run !== this.run) return;
          this.fail(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Turning speech into text took too long. Please try again.');
        }
      };
      recorder.start(1000);
      this.setState('recording');
      this.timer = setTimeout(() => this.stop(), 60000);
    } catch (cause) {
      if (run !== this.run) return;
      const name = cause instanceof Error ? cause.name : '';
      this.fail(name === 'NotAllowedError' ? 'Microphone access is off. Click the lock or microphone icon beside the address bar to allow it, then try again.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one, then try again.'
        : name === 'NotReadableError' ? 'Your microphone is busy. Close other apps using it, then try again.'
        : 'The microphone could not start. Check its permission and try again.');
    }
  }
}
