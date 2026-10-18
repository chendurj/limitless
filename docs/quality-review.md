# App quality review — October 18, 2026

## Result

**61 tests passed:** 26 browser scenarios, 8 chat endpoint tests, 19 questionnaire voice/parsing tests, and 8 transcription endpoint tests. The final browser run had no retries, skipped tests, flaky results, or uncaught browser exceptions. Full ESLint and TypeScript checks pass.

Browser environment: local Next.js development server, Chrome, Node.js 24, macOS. Desktop and 375-pixel mobile layouts were exercised.

## Fixes included

- Browser SpeechRecognition could fail with a network error even when microphone access and chat worked. Dictation now records audio directly and transcribes it through the server. The empty review box is hidden until words are ready. Starting, recording, and transcribing have distinct states; cancellation releases late-arriving permission streams and ignores stale transcripts.

- Saved questionnaire answers and the current step were being overwritten during initial effects, especially in development Strict Mode. Restore now happens before persistence; corrupt drafts are validated rather than trusted.
- Expanded chat content could intercept clicks intended for the homepage navigation. The navigation now stays above the hero content and does not shrink.
- Switching questionnaire branches could submit stale, hidden mobility or hearing answers. Only currently visible questions are submitted.
- Other-only answers were dropped when no option had been selected. They now reach the intake API. The missing Something else field on must-have questions is rendered, with the existing single microphone retained.
- Party size accepted zero. Number fields now require whole numbers, with at least one traveler.
- Follow-up answers could show repeated options or whitespace/case variants. Options are normalized and deduplicated; free-text follow-ups have an accessible name.
- Rapid repeated actions could send duplicate trip, status, feedback, or Undo requests. Synchronous in-flight guards prevent duplicates, with disabled controls while appropriate.
- A cancelled feedback request could replace a newly opened dialog with an old proposal. Cancelled and superseded responses are now ignored, and microphone input is cancelled when the dialog closes.

## Speed observations

These are individual local measurements, not averages, production benchmarks, or load tests:

- Warm local questionnaire navigation: 53ms.
- Live OpenAI chat response: 1671ms.
- Real recording to live transcription: 864ms.

The final browser run completed in approximately 29.9 seconds. Artificial planning API delays check loading states and double-submit protection; they do not measure real planning speed. The real recording case used generated speech through Chrome's actual getUserMedia/MediaRecorder APIs and the live server transcription endpoint.

## Browser scenarios

| Case | Scenario | Result |
|---|---|---|
| 01 | desktop homepage navigation is clickable without overlap | Pass |
| 02 | mobile chat fits the viewport without horizontal overflow | Pass |
| 03 | rapid chat submissions create one request and one pair of messages | Pass |
| 04 | failed chat retains the draft and retries without duplicate text | Pass |
| 05 | recorded speech is appended once after transcription completes | Pass |
| 06 | every visible question has unique choices and exactly one microphone across all branches | Pass |
| 07 | saved questionnaire restores the selected step and answers on reload | Pass |
| 08 | corrupt saved JSON does not break the questionnaire | Pass |
| 09 | malformed saved answer shapes and step numbers are discarded safely | Pass |
| 10 | changing branches does not submit stale hidden access needs | Pass |
| 11 | Other-only answers and must-have Other text reach the intake API | Pass |
| 12 | party size rejects zero and fractional numbers before advancing | Pass |
| 13 | must-have and nice-to-have selections remain mutually exclusive | Pass |
| 14 | switching microphones cancels the previous field and errors keep manual choices usable | Pass |
| 15 | follow-up choices are deduplicated and free text has a real accessible label | Pass |
| 16 | repeated Finish and Plan actions send only one request while showing loading state | Pass |
| 17 | itinerary keyboard tabs show exactly one day and no duplicated stops | Pass |
| 18 | rapid itinerary status clicks create one update request | Pass |
| 19 | feedback applies once, and repeated Undo clicks create only one restoration | Pass |
| 20 | cancelling in-flight feedback does not overwrite the next conversation | Pass |
| 21 | warm local questionnaire navigation responds within one second | Pass |
| 22 | live assistant returns a nonempty answer and records actual response time | Pass |
| 23 | real browser recording reaches live transcription and selects the reviewed option | Pass |
| 24 | failed transcription shows one error without an empty review box | Pass |
| 25 | cancelled transcription never fills or selects an answer later | Pass |
| 26 | cancelled permission prompts release a stream that arrives late | Pass |

## Unit coverage

- **8 chat cases:** malformed input, instruction-role rejection, origin and size checks, missing configuration, local host normalization, conversation forwarding, upstream failures, and longer-history bounds.
- **19 questionnaire cases:** coverage of each configured screen (including deferred configurations), the nine-step mobility flow, label/number parsing, ambiguous and negated answers, explicit must-have levels, valid integers, complete dates, and free-text bounds.

- **8 transcription cases:** same-origin checks, file formats and codec parameters, missing configuration, recording size bounds, server-side file forwarding, upstream failures, and missing/oversized transcripts.

## Limits and remaining verification

- Planning, profile, trip status, feedback, and replan endpoints used intercepted responses from labeled demo fixtures. No production profiles or trips were created. The live FastAPI/database planning path and real itinerary generation speed remain unverified in this environment.
- The assistant timing case called the real local `/api/chat` route and OpenAI using the configured server key. No key is stored in the test or this report.
- Most recording scenarios use simulated media for deterministic error and cancellation checks. One case records generated spoken audio through real Chrome media APIs, transcribes it with OpenAI, and applies the reviewed choice. The user's physical microphone, manual browser permission settings, varied voices/accents, Safari, and screen readers still need human testing.
- `npm run build` was attempted with escalation, but Turbopack's CSS worker failed to bind a local port (`Operation not permitted`). Production build verification remains blocked by this environment; it is not counted as a passing check.

## Reproduce

From `web/`, with Node.js 24:

```sh
npm ci
npm run lint
npx tsc --noEmit
npm run test:chat
npm run test:questionnaire-voice
npm run test:transcribe
npx playwright install chromium
npm run test:e2e
```

The ordinary browser run skips the live assistant and real-audio cases. To run all 61 cases, configure `OPENAI_API_KEY` in `web/.env.local` and provide a WAV saying “Option one” followed by a few seconds of silence:

```sh
LIVE_CHAT_TEST=1 VOICE_TEST_AUDIO=/absolute/path/option-one.wav npm run test:e2e
```

Chrome is required for the generated-audio case; set `PLAYWRIGHT_CHANNEL=chrome` when using an installed Chrome browser instead of Playwright Chromium. The configured flags use the file as a fake microphone, without recording the user's physical microphone. The test runner reuses an existing local server or starts one. Failure screenshots, traces, and JSON reports are saved under ignored `web/test-results/`.
