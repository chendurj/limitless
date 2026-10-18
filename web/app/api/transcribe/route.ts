// Receive bounded audio from the browser, call the provider with a server-only key,
// and return editable text. Audio is forwarded in memory, not saved to an app file.
export const maxDuration = 60;
const MAX_BYTES = 8 * 1024 * 1024;
const formats: Record<string, string> = {
  'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'mp4',
  'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3',
};
function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// A per-address limit, because each OpenAI call costs money. The counts live in one server
// instance, so this slows abuse; it is not a hard quota. (Kept in this file so the route
// tests can import it without the '@/' path alias.)
const recent = new Map<string, number[]>();
function allow(request: Request, limit: number, windowMs: number, now = Date.now()) {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const times = (recent.get(address) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= limit) { recent.set(address, times); return false; }
  times.push(now);
  recent.set(address, times);
  if (recent.size > 5000) recent.clear(); // keep memory bounded
  return true;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== `${url.protocol}//${request.headers.get('host') || url.host}`) {
    return error('Please start the microphone from the Limitless website.', 403);
  }
  const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  if (!formats[mime]) return error('This audio format is not supported. Please try another browser.', 415);
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return error('That recording is too long. Please record a shorter answer.', 413);
  // Each recording costs money: at most 40 in 10 minutes from one address.
  if (!allow(request, 40, 10 * 60 * 1000)) {
    return error('You recorded many answers just now. Please wait a few minutes, or type.', 429);
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return error('Voice input is not connected on this server yet. You can still type.', 503);
  try {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return error('The recording was empty. Please speak and try again.', 400);
    if (bytes.byteLength > MAX_BYTES) return error('That recording is too long. Please record a shorter answer.', 413);
    const form = new FormData();
    form.set('file', new File([bytes], `answer.${formats[mime]}`, { type: mime }));
    form.set('model', process.env.OPENAI_MODEL_TRANSCRIBE || 'gpt-4o-mini-transcribe');
    form.set('response_format', 'json');
    form.set('language', 'en');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]), cache: 'no-store',
    });
    if (!response.ok) return error(response.status === 429
      ? 'Voice input is busy. Please try again in a minute.'
      : 'We could not turn the recording into text. Please try again, or type your answer.', response.status === 429 ? 429 : 502);
    const result = await response.json();
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text) return error('We did not hear any words. Please speak a little closer to the microphone and try again.', 422);
    if (text.length > 2000) return error('That answer is too long. Please try a shorter recording.', 422);
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return error('Voice input could not finish. Check your connection and try again.', 502);
  }
}
