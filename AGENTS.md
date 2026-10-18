# Limitless: agent context

Read this before changing anything. Limitless (planned as AccessPath) is an accessible trip planner for San Diego, built at DubHacks '26 (Sat 10/17 12:30 PM to Sun 10/18 10:00 AM PT). It serves wheelchair and limited-mobility travelers and blind and low-vision travelers.

## Core rule

**The database decides access. The LLM only explains.**

- Scoring filters places against the traveler's Accessibility DNA. The LLM picks only from that filtered shortlist and cites every accessibility claim by `fact_id`.
- Every accessibility fact has a source and a confidence: `VERIFIED`, `COMMUNITY` or `INFERRED`. A field with no source stays `unknown`.
- **Never invent accessibility facts**, in code, seed data, prompts, tests or UI copy. Fixtures and mock data are labeled as demo data.
- Negative evidence outweighs positive. A "yes" from an unverified source never satisfies a must-have.
- Perceptron photo findings are `INFERRED` (source: image URL and capture date). They can warn or exclude, never satisfy a must-have. A team-confirmed finding becomes `VERIFIED`.
- Images come from the Mapillary API (CC BY-SA, keep attribution). Never scrape Google Maps, Street View or Earth imagery.

## Team and folders

Stay in your own folder to avoid merge conflicts.

| Person | Lane | Folders |
|---|---|---|
| Chendur | Backend, AI, infra | `api/`, `supabase/` |
| Akshith | Frontend, accessibility | `web/` |
| Sashwath | Product, data, pitch | `data/`, `docs/` |

## Stack

- `web/`: Next.js (App Router, TypeScript, Tailwind), Node 24. API types in `web/types/api.d.ts` are **generated** by openapi-typescript from FastAPI; don't edit them by hand.
- `api/`: FastAPI, Python 3.11+, uv, Pydantic. Models live in `api/app/models/`.
- `supabase/`: Postgres + pgvector, migrations in `supabase/migrations/`. RLS is on for every table. New tables are not exposed automatically, so grant `service_role` access in the migration.
- OpenAI: `gpt-6-luna` for extraction, follow-ups and feedback parsing; `gpt-6.1-sol` for itinerary composition. Model names come from env vars.
- Google Places API (New) + Routes (server only), Maps JavaScript (browser), Open-Meteo, Web Speech API.

## Secrets

- Never commit a key or paste one into chat. `.env`, `.env.*` and `*.env` are gitignored; `.env.example` lists every variable with no values.
- Server keys go in `api/.env`. Only public values go in `web/.env.local` as `NEXT_PUBLIC_*`. **Never prefix a secret with `NEXT_PUBLIC_`.**
- This repo becomes public before submission. Write every commit as if it's already public.

## Accessibility of the app itself

- The intake works with keyboard only and with a screen reader: `fieldset`/`legend`, real labels, visible focus, `aria-live` for status.
- Never-cut features: fact badges with sources, the "Places we skipped" panel with reasons, the feedback → re-plan loop, an accessible intake, and the consent checkbox.

## Working rules

- One task card at a time, on its own branch named for the task: `scoring`. Do not use task keys in branches, commits, PRs or files.
- Commit messages are plain, natural sentences with no prefix and no AI co-author trailer: `Add hard and soft filters to scoring`.
- A human reviews every change before it merges to `main`. Pull before starting work.
- For every change, push the task branch and open or update a pull request so the repository owner can review it. Do not push directly to `main` unless the user explicitly requests it.
- Judging weights: functionality 30%, track fit (accessibility and assistive tech) 30%, design 20%, creativity 20%. A working end-to-end path beats extra features.
- Task board (status source of truth): https://claude.ai/artifact/QXYMhSfLr3xvCjHBczb6Xp
- Times are Pacific. Gates: Devpost draft Sat 10:30 PM, feature freeze Sun 7:30 AM, submit Sun 9:30 AM.
