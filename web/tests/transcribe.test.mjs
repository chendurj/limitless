import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { POST } from '../app/api/transcribe/route.ts';
const originalFetch = globalThis.fetch;
const key = process.env.OPENAI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
});
function request(body = new Uint8Array([1, 2, 3]), type = 'audio/webm', origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/transcribe', { method: 'POST', body, headers: { 'Content-Type': type, Origin: origin } });
}
test('rejects requests from another origin', async () => {
  assert.equal((await POST(request(undefined, undefined, 'https://elsewhere.example'))).status, 403);
});
test('rejects unsupported input formats', async () => {
  assert.equal((await POST(request('not audio', 'application/json'))).status, 415);
});
test('reports missing server configuration without exposing the key', async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
});
test('rejects empty and oversized recordings', async () => {
  process.env.OPENAI_API_KEY = 'test-only-key';
  assert.equal((await POST(request(new Uint8Array()))).status, 400);
  assert.equal((await POST(request(new Uint8Array(8 * 1024 * 1024 + 1)))).status, 413);
});
test('sends audio as a file and returns only the transcript', async () => {
  process.env.OPENAI_API_KEY = 'test-only-key';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    assert.equal(options.body.get('file').type, 'audio/webm');
    assert.equal(options.body.get('model'), process.env.OPENAI_MODEL_TRANSCRIBE || 'gpt-4o-mini-transcribe');
    assert.equal(options.body.get('language'), 'en');
    assert.equal(options.cache, 'no-store');
    return Response.json({ text: ' Option one. ', usage: { test: true } });
  };
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { text: 'Option one.' });
});
test('supports browser MIME parameters and Safari MP4', async () => {
  process.env.OPENAI_API_KEY = 'test-only-key';
  for (const mime of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.body.get('file').type, mime.split(';')[0]);
      return Response.json({ text: 'Option two.' });
    };
    assert.equal((await POST(request(undefined, mime))).status, 200);
  }
});
test('handles API rate limits, bad responses, and network errors safely', async () => {
  process.env.OPENAI_API_KEY = 'test-only-key';
  for (const status of [429, 401, 500]) {
    globalThis.fetch = async () => new Response('private upstream details', { status });
    const response = await POST(request());
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.doesNotMatch(await response.text(), /test-only-key|private upstream/);
  }
  globalThis.fetch = async () => { throw new Error('private connection details'); };
  assert.equal((await POST(request())).status, 502);
});
test('does not turn missing speech or oversized transcripts into an answer', async () => {
  process.env.OPENAI_API_KEY = 'test-only-key';
  for (const data of [{}, { text: '' }, { text: 'x'.repeat(2001) }]) {
    globalThis.fetch = async () => Response.json(data);
    assert.equal((await POST(request())).status, 422);
  }
});
