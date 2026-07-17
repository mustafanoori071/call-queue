# Call Queue

Swipeable cold-call queue: load leads from a Google Sheet (paste or live link), see one at a time, tap to dial, swipe to mark called/skipped.

## Quick start

```bash
cd call-queue
npm install
npm run dev
```

Open http://localhost:5173 on your phone (same Wi‑Fi) or desktop.

## Deploy to Vercel

1. Push this `call-queue/` folder to a GitHub repo (or use the repo root with Vercel's root directory set to `call-queue`)
2. Connect at [vercel.com](https://vercel.com) — every push to `main` auto-deploys
3. On your phone: open the URL → Share → **Add to Home Screen**

## Data input

- **Paste data** — copy your sheet (Cmd/Ctrl+A) and paste. Always works.
- **Sheet link** — paste a Google Sheet URL with sharing set to "Anyone with the link — Viewer." Works from a deployed domain (not in sandboxed iframes).

## Next steps

See the original handoff notes in the parent README for persistence (`localStorage` or Sheets API) and PWA polish ideas.
