# Deploy

The web app runs on **Vercel**. The API runs on **Render** (Docker). The database stays on Supabase.
Put secrets only in the Vercel and Render dashboards. Never put them in the repo.

## 1. API on Render

1. In Render: **New → Blueprint**, then choose this repo. Render reads `render.yaml` and creates `limitless-api` (Docker, from `api/`).
2. Set the secret variables when Render asks. Copy each value from `api/.env`, with no space after `=`:
   - `DATABASE_URL`: the Supabase **session pooler** string
   - `OPENAI_API_KEY`
   - `DEMO_BEARER_TOKEN`
   - `CORS_ORIGINS`: a JSON list. Set `["https://placeholder.example"]` first, and change it after step 2.
3. Wait for the deploy. Check `https://<api>.onrender.com/health`. It returns `{"status":"ok"}`.

The `starter` plan does not sleep. On the free plan, the first request after 15 idle minutes takes about 1 minute, so open `/health` before a demo.

## 2. Web on Vercel

1. In Vercel: **Add New → Project**, then choose this repo. Set **Root Directory** to `web`. Vercel finds Next.js.
2. Add the environment variables:
   - `NEXT_PUBLIC_API_URL`: `https://<api>.onrender.com`
   - `NEXT_PUBLIC_DEMO_BEARER_TOKEN`: the same value as `DEMO_BEARER_TOKEN`
   - `OPENAI_API_KEY`: for the homepage chat and voice transcription, server side only
   - `OPENAI_MODEL_CHAT`: `gpt-6-luna`
3. Deploy, and copy the URL, for example `https://limitless-xyz.vercel.app`.

## 3. Connect them

1. In Render, set `CORS_ORIGINS` to `["https://limitless-xyz.vercel.app"]`. Add the custom domain too, if there is one. Render deploys again.
2. Open the Vercel URL. Check the homepage chat, the intake, `/trips/00000000-0000-4000-8000-0000000000b1`, and Tell Limitless.

## After the event

Rotate `DEMO_BEARER_TOKEN`, `OPENAI_API_KEY` and the Supabase database password. The demo token is visible in the browser.
