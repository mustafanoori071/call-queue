# Call Queue

Swipeable cold-call queue for local service outreach. Load leads from Google Sheets, dial one at a time, log outcomes, take notes, schedule callbacks, and export results.

## Features

- **Paste or live sheet link** — CSV paste (always works) or Google Sheet URL fetch
- **Column mapping** — auto-detects name, phone, business, status, notes
- **Queue filters** — skip already-called rows, only empty status
- **Rich outcomes** — interested, no answer, voicemail, not interested, callback, bad number, skip
- **Call notes** — jot context after each dial
- **Callbacks** — schedule date/time, view due and upcoming reminders
- **Auto-save** — progress persists in `localStorage`; resume where you left off
- **Session analytics** — contact rate, interest rate, outcome breakdown
- **CSV export** — download full results with notes and timestamps
- **PWA** — install via Add to Home Screen (iOS/Android)

## Quick start

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub and connect at [vercel.com](https://vercel.com). Build command: `npm run build`, output: `dist`.

## Theme

Blue accent on dark navy (`#3B82F6` on `#0B1220`).
