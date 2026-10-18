This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Browser regression tests

Use `npm run test:e2e` for the Playwright suite. Install Chromium with
`npx playwright install chromium`, or use `PLAYWRIGHT_CHANNEL=chrome` with an
installed Chrome browser. The runner reuses or starts the local development server.
Planning API responses are intercepted demo fixtures. Set `LIVE_CHAT_TEST=1` with
a configured server key to include the real assistant request; otherwise that one
case is skipped. See [the quality review](../docs/quality-review.md) for coverage,
measured timings, known limits, and the commands for all 61 tests.

## Getting Started

Use Node.js 24 and run `npm ci` before starting development.

### Guest profiles and saved trips

Enable **Allow anonymous sign-ins** in the existing Supabase project's
Authentication → Sign In / Providers settings. In `web/.env.local`, configure:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Use the same Supabase project as the API's `SUPABASE_URL` and
`SUPABASE_SECRET_KEY`. Never put the secret/service-role key in a public variable.
Restart the web server after changing environment variables.

Choose **My trips** or **Plan your trip**, then **Continue as guest**. A nickname
is optional. Supabase persists and refreshes the session in browser storage.
The browser sends its access token to FastAPI; the API verifies it with Supabase
Auth and uses the verified user ID for every profile, trip, and feedback query.
Existing database RLS remains deny-by-default for direct browser access; there
are no schema changes to apply. Private API responses are never cached.

My trips opens a separate dashboard with search, upcoming/past filters, trip
counts, and the guest's 50 most recent itineraries. The guest profile sits in a
collapsed settings panel. Each trip offers **Open itinerary**, **Edit with AI**,
and **Edit manually**. AI edits are previewed before Apply and support Undo.
Manual edits can skip/restore stops, set whether a stop is kept during re-planning,
and save a personal note (up to 500 characters). Personal notes are not
accessibility evidence; manual edits retain the existing schedule. AI re-planning
preserves skipped stops and carries notes forward for places that remain.
The homepage assistant can guide navigation but cannot directly
read or change a saved trip. The two seeded samples remain public, read-only
examples and do not become the guest's personal trips.

Clearing browser storage or switching browser/device can lose access to a guest
account. Do not silently create a replacement when session refresh fails. Linking
an email or Google identity later is a separate feature. Enable Supabase's bot
protection and integrate its CAPTCHA challenge before a broad public launch.

The old shared bearer token is disabled by default. `ALLOW_DEMO_AUTH=true` on the
API explicitly restores legacy demo authentication for development only; the
frontend never falls back to that token. Existing shared demo itineraries are
not migrated into a new guest's account.

### Homepage assistant

The homepage “Ask me anything” card posts to the same-origin `/api/chat` route.
The Next.js server calls OpenAI's Responses API; no additional Python service is
needed for chat. Set these **server-only** values in `web/.env.local`:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL_CHAT=gpt-6-luna
```

Use an available model in your OpenAI project if needed. Never add `NEXT_PUBLIC_`
to these names. Restart the web server after changing environment values.
The route returns a friendly unavailable message until the key is configured.
Conversation history stays in page memory, sends up to the last twenty exchanges (within a 60,000-character request budget),
and is cleared on reload or “New chat”. Requests use `store: false`.

The assistant helps with travel preparation and app questions. It has no database
or live venue access and directs personalized place selection to `/intake`.
It cannot book travel or modify itineraries.

The microphone records audio using the browser's MediaRecorder API. Choose the
microphone, allow access, speak, then choose Stop microphone. The web server sends
that recording to OpenAI's transcription API and returns the recognized text. The
browser's SpeechRecognition service is not used, so its network failures no longer
block dictation. It uses the existing server `OPENAI_API_KEY`; optionally set
`OPENAI_MODEL_TRANSCRIBE` (default `gpt-4o-mini-transcribe`).

Text appears after you stop, rather than while you are speaking. Review or edit it
before sending or applying it. Recordings stop after one minute and are limited to
8 MiB. Cancel, navigation, and unmount discard unsent recordings and abort pending
transcription. The app does not persist audio files. Microphone recording requires
HTTPS or localhost, browser permission, and a browser supporting getUserMedia and
MediaRecorder. Permission denial, busy devices, and transcription errors leave the
normal text and choice controls available. AI replies remain in text chat.

### Questionnaire voice answers

Every rendered intake question offers **Speak answer**, including all nine steps
in the mobility flow and the conditional hearing/communication branch. Speak,
choose **Stop microphone**, review or edit the transcript, then choose **Use this
answer**. Check the regular fields before choosing Next. Voice never advances a
step or changes an answer without that confirmation.

- Choices accept the complete shown label or numbered choices, such as “option
  two” or “option one and option three”. Multi-select answers replace that
  question's selected choices after confirmation.
- Requirements need an explicit level: “option two must have, option five nice
  to have”. Other existing requirement levels remain unchanged.
- Numbers accept digits or simple number words. Dates require a full date, such
  as “October 22, 2026”; unclear or incomplete dates are not guessed.
- Text and existing Something else fields accept dictated text. Unsupported or
  unclear answers can be edited or entered using the original controls.
- Only one microphone records at a time. Changing questions, cancelling, or
  leaving a screen releases the microphone and discards pending transcription.

Run `npm run test:questionnaire-voice` for parsing and questionnaire coverage tests.

Run `npm run test:chat`, `npm run lint`, and `npm run build` to verify changes.
For around-the-clock access, deploy the web app on an always-available Next.js
host and configure the same server environment variables there. Availability
depends on your host and OpenAI quota. Apply the host's rate limiting and spend
controls before opening this unauthenticated endpoint to public traffic.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Microphone regression checks

`npm run test:transcribe` checks the server endpoint, including unsupported files,
size limits, missing configuration, upstream failures, and empty transcripts.
Browser tests normally mock audio and API results. To test actual MediaRecorder
capture and the real transcription endpoint with generated speech, provide an
absolute WAV path containing “Option one” followed by a few seconds of silence:

```sh
PLAYWRIGHT_CHANNEL=chrome LIVE_CHAT_TEST=1 VOICE_TEST_AUDIO=/absolute/path/option-one.wav npm run test:e2e
```

Chrome uses that file as its test microphone; this does not record the user's
microphone. Without VOICE_TEST_AUDIO, the live recording case is skipped.
