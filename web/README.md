# Limitless web

Next.js App Router interface for the Limitless accessible travel planner. The [root README](../README.md) covers the product story, walkthrough, architecture, and complete local setup.

## Development

Use Node.js 24. From the repository root:

```bash
cd web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The planning API runs separately on port 8000.

Create `web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
OPENAI_API_KEY=your_server_only_openai_key
```

Optional server variables are `OPENAI_MODEL_CHAT` and `OPENAI_MODEL_TRANSCRIBE`; defaults are documented in [`.env.example`](../.env.example). Never prefix an OpenAI or Supabase secret key with `NEXT_PUBLIC_`. Restart the development server after changing environment variables.

## Screens and boundaries

| Path | Purpose |
| --- | --- |
| `/` | Landing page and conversational app/travel guide. |
| `/intake` | Guest sign-in, adaptive questions, reviewed answers, and trip creation. |
| `/my-trips` | Saved trip cards, editing links, deletion confirmation, and guest nickname. |
| `/trips/[id]` | Day tabs, stop details, status controls, AI edits, manual edits, and Undo. |
| `/how-it-works`, `/features` | Product explanation. |
| `/reviews` | Coming-soon page. |
| `/api/chat` | Server-side conversation proxy; it cannot access or modify saved trips. |
| `/api/transcribe` | Server-side audio-to-text endpoint. |

The two explicit sample trip IDs render read-only. All personal trip routes use `GuestGate`. Supabase persists the guest identity in browser storage and refreshes its session; FastAPI verifies the access token and enforces ownership. Clearing browser storage or changing devices can lose access to an unlinked guest identity.

## Voice input

Recording uses `getUserMedia` and `MediaRecorder`, with transcription handled by the Next.js server. It requires HTTPS or localhost, microphone permission, and a compatible browser.

1. Choose **Speak answer** or **Speak**.
2. Speak, then choose the stop control.
3. Review or edit the transcript.
4. Confirm the answer or submit the trip-change request.

Questionnaire voice parsing matches the question’s allowed choices. When supported, unmatched words can be saved in the question’s additional-notes field. A voice answer never advances the questionnaire automatically. Dates and date ranges still pass the shared calendar validation.

Recordings stop after one minute and are limited to 8 MiB. Cancel and navigation discard pending input. Audio is not persisted to an application file; it is sent to the transcription provider. Normal text/choice controls remain available if recording fails.

## Itinerary editing

- **AI:** describe the change → **Update my plan** → review → **Save changes**. **Undo** selects the earlier saved version. Completed, in-progress, skipped, and kept stops are protected during repair.
- **Manual:** skip/restore a stop, keep it during AI replanning, or save a personal note. These edits retain the existing schedule.
- **Delete:** an inline confirmation precedes the owner-scoped API request; the card is removed after success.

Venue actions open external websites; they do not create reservations inside Limitless. See [the architecture guide](../docs/architecture.md) for scoring-display notes and the main implementation files.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run test:chat
npm run test:transcribe
npm run test:questionnaire-voice
node --experimental-strip-types --test tests/voice-edge-cases.test.mjs tests/trip-dates.test.mjs tests/trip-evidence.test.mjs
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`, or install Playwright Chromium with `npx playwright install chromium`. Browser tests use mocked sessions and planning responses. Real-provider cases are opt-in and need the corresponding environment configuration; see [the quality review](../docs/quality-review.md).

To exercise the real recording/transcription path with a synthetic test microphone, provide an absolute WAV path:

```bash
PLAYWRIGHT_CHANNEL=chrome VOICE_TEST_AUDIO=/absolute/path/option-one.wav npm run test:e2e
```

The homepage assistant’s live-provider test is separately enabled with `LIVE_CHAT_TEST=1`. These options may consume provider quota.

## API types and deployment

API types are generated from FastAPI. Change the Python models first, then run `./scripts/gen-types.sh` from the repository root. Do not hand-edit `types/api.d.ts`.

Vercel uses `web` as the project root. Configure the same public Supabase variables, a deployed `NEXT_PUBLIC_API_URL`, and server-side OpenAI credentials, then redeploy. See [deployment instructions](../docs/deploy.md).
