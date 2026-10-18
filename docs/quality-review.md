# App quality review — October 18, 2026

## Calendar and shorter demo update

The active intake now has **5–7 questions**, including an optional start-date calendar. Separate avoidances and transport screens are removed from the demo. Additional barriers can be entered under access needs; old explicitly selected avoidances and transport are preserved as editable notes during draft migration. Unanswered fields remain unknown.

Access features and interests initially show six options; walking shows four. More options remains available on request, and any previously selected extra stays visible even when the list is collapsed or reloaded. No selected must-have is discarded. Older draft step numbers reset for the new layout.

The chosen date is validated against past/invalid dates and sent directly to trip creation, as well as intake, rather than relying on model extraction alone. Blank dates remain optional.

Validation: **53 Chrome browser scenarios and 40 questionnaire/voice tests passed**; two live API cases were skipped in this update. Lint, TypeScript and diff checks pass. New browser regressions verify short lists, selected-extra persistence, legacy note preservation and calendar-to-trip date propagation. All 128 needs combinations stay between five and seven questions. Guest and planning responses use the same test-only mocks described below.

## Previous full regression round

After the full run, main received the simplified saved-trips page (`a83a0fc`). It merged cleanly. Four affected integration cases were rerun and passed: saved-trip navigation, manual save/reload, AI editing and rapid manual-save protection. Lint and TypeScript were also rerun successfully. These repeats are not counted as extra distinct tests below.

**121 distinct tests passed:** 52 Chrome browser scenarios and 69 Node tests. No skipped tests, retries, flaky browser results or uncaught browser exceptions in the final run. ESLint, TypeScript and diff checks pass.

| Area | Tests |
|---|---:|
| Browser journeys, text and voice input, saved trips, editing, booking, mobile and keyboard | 52 |
| Chat endpoint validation, conversation handling and failures | 10 |
| Existing questionnaire voice parsing and all 128 needs combinations | 15 |
| Transcription endpoint validation and failures | 8 |
| Venue link completeness, matching and evidence integrity | 10 |
| Additional individually named voice edge cases | 26 |
| **Total** | **121** |

### Bugs reproduced and fixed

- Natural voice matching could reverse preference meaning: “I hate beaches” selected beaches as an interest; “I enjoy crowds” selected crowds as something to avoid. Avoidance language is now accepted only in the relevant questions. Contradictory phrases require clarification and leave current selections unchanged. Positive interests, explicit numbered choices and “I prefer to avoid crowds” still work. Browser regression covers correcting the transcript by typing and applying it once.
- Submitting a manual stop edit twice before React updated the button sent two PATCH requests. A synchronous in-flight guard now admits one update and resets after success or failure. The regression reproduced two requests before the fix and confirms one afterwards.

### Journey coverage and limits

Eight complete questionnaire journeys cover interests only, wheelchair use, limited walking, temporary injury, Deaf, non-speaking, combined mobility/hearing/communication/service-animal needs, and service-animal travel without assuming mobility needs. Each exercises different selected options, explicit must-haves, personal typed text, the six-to-eight-question limit and the exact API payload. Other browser checks cover corrupt drafts, hidden stale answers, duplicate options, cancellation, late microphone permissions, unsupported recording, retries, loading states, manual editing, AI editing, all preview days and external booking navigation.

The final run includes live OpenAI chat and real Chrome getUserMedia/MediaRecorder audio capture sent through the live transcription endpoint. The audio is generated speech from a WAV fixture, not the user's physical microphone. Guest sessions and planning, saved-trip and editing API responses are mocked and labeled demo data; no real guest accounts or bookings are created. This round does not exercise the Python backend's real database/planner integration, physical microphones, every accent, Safari or assistive-technology combinations. It is broad regression coverage, not a claim that every possible edge case is tested.

### Local configuration finding

`web/.env.local` has a server chat/voice key, but no `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The ordinary local guest sign-in cannot work until the project’s public Supabase settings are configured. Tests use explicit dummy settings and intercepted auth responses; they do not establish that real local or deployed authentication works. No credentials were printed or committed.

### Local timing samples

- Warm questionnaire navigation: **54 ms**.
- Live chat response: **2,022 ms**.
- Stop recording to live transcript: **1,872 ms**.
- Full 52-case browser run: **60.5 seconds**.

These are single local development measurements, not production/load benchmarks.

### Reproduce

From `web/`, with Node 24, Chrome and a server API key configured in ignored `.env.local`:

```sh
npm run lint
./node_modules/.bin/tsc --noEmit
node --experimental-strip-types --test tests/chat.test.mjs tests/questionnaire-voice.test.mjs tests/transcribe.test.mjs tests/trip-evidence.test.mjs tests/voice-edge-cases.test.mjs
NEXT_PUBLIC_SUPABASE_URL=https://limitless-test.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-only-key PLAYWRIGHT_CHANNEL=chrome LIVE_CHAT_TEST=1 VOICE_TEST_AUDIO=/absolute/path/option-one.wav npm run test:e2e
```

Use an isolated dev server started with the same dummy guest settings; stop an existing dev server before this browser command. The guest settings above are test placeholders, not credentials. The audio fixture says “Option one” followed by silence. Browser reports and screenshots remain in ignored `web/test-results/`.

---

## Earlier regression round (historical)

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
