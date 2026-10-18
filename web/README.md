This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js 24 and run `npm ci` before starting development.

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
Conversation history stays in page memory, sends at most the last five exchanges,
and is cleared on reload or “New chat”. Requests use `store: false`.

The assistant helps with travel preparation and app questions. It has no database
or live venue access and directs personalized place selection to `/intake`.
It cannot book travel or modify itineraries.

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
