# Deploy

The web app runs on **Vercel**. The API runs on **Render** (Docker). The database stays on Supabase.
Put secrets only in the Vercel and Render dashboards. Never put them in the repo.

## 1. API on Render

1. In Render: **New → Blueprint**, then choose this repo. Render reads `render.yaml` and creates `limitless-api` (Docker, from `api/`).
2. Set the secret variables when Render asks. Copy each value from `api/.env`, with no space after `=`:
   - `DATABASE_URL`: the Supabase **session pooler** string
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`: the existing Supabase project URL
   - `SUPABASE_SECRET_KEY`: that project's server-only secret key, used to verify guest tokens
   - `CORS_ORIGINS`: a JSON list. Set `["https://placeholder.example"]` first, and change it after step 2.
3. Wait for the deploy. Check `https://<api>.onrender.com/health`. It returns `{"status":"ok"}`.

The `starter` plan does not sleep. On the free plan, the first request after 15 idle minutes takes about 1 minute, so open `/health` before a demo.

## 2. Web on Vercel

1. In Vercel: **Add New → Project**, then choose this repo. Set **Root Directory** to `web`. Vercel finds Next.js.
2. Add the environment variables:
   - `NEXT_PUBLIC_API_URL`: `https://<api>.onrender.com`
   - `NEXT_PUBLIC_SUPABASE_URL`: the same project URL as the API
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the project's publishable key (never the secret key)
   - `OPENAI_API_KEY`: for the homepage chat and voice transcription, server side only
   - `OPENAI_MODEL_CHAT`: `gpt-6-luna`
3. Deploy, and copy the URL, for example `https://limitless-xyz.vercel.app`.

## 3. Connect them

1. In Render, set `CORS_ORIGINS` to `["https://limitless-xyz.vercel.app"]`. Add the custom domain too, if there is one. Render deploys again.
2. Enable **Allow anonymous sign-ins** under Authentication → Sign In / Providers in that Supabase project.
3. Open the Vercel URL. Check the homepage chat, Continue as guest, the shortened intake, My trips, Edit with AI, and Edit manually. The sample at `/trips/00000000-0000-4000-8000-0000000000b1` stays read-only.
4. Restart/redeploy both services after adding variables. No database migration is required for guest profiles or manual notes. Add CAPTCHA to the guest sign-in flow before a broad public launch.

## After the event

Rotate any previously exposed `DEMO_BEARER_TOKEN`, `OPENAI_API_KEY` and the Supabase database password. Shared demo authentication is disabled by default; do not enable it on the public deployment.
