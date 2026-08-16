# IPO Time Machine — Presenter Mode + Live Vote

This workspace adds two features:

- Presenter Mode: "Guess First" flow with masked results, reveal animation, confetti/impact effects.
- Live Vote tab backed by Vercel KV for realtime-ish classroom voting.

Deployment steps (Vercel KV):

1. Create a KV instance: `vercel kv create <name>` or via Vercel dashboard → Storage → KV.
2. Link the KV instance to this project so Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Install dependencies locally if you want to run serverless functions locally: `npm install`.
4. Deploy to Vercel. The serverless API at `/api/vote` uses `import { kv } from '@vercel/kv'`.

API contract:

- `GET /api/vote?session=<id>&voter=<optional voterId>` → `{ positive, negative, voted, version }`
- `POST /api/vote?session=<id>&choice=positive|negative` with header `x-voter-id` → increments atomically, returns new tally
- `DELETE /api/vote?session=<id>` → resets round by bumping internal version

Notes:

- The API uses a versioned key strategy to avoid needing to enumerate/delete per-voter keys when resetting a round.
- Local dev without KV will return a helpful error message from the API.
