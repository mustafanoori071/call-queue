# Call Queue

Swipeable cold-call queue for team outreach. Load leads from a shared Google Sheet, dial one at a time, log outcomes, and write status back so nobody calls the same lead twice.

## Features

- **Team passcode gate** — shared code checked server-side (not in the frontend)
- **Live Google Sheet read** — fetches uncalled leads from `VITE_SHEET_URL`
- **Sheet write-back** — posts outcomes to Google Apps Script on each action
- **Caller name** — saved per device, written to `Called By` column
- **Rich outcomes** — interested, no answer, voicemail, not interested, callback, bad number, skip
- **Callbacks, notes, analytics, CSV export**
- **PWA** — Add to Home Screen on iOS/Android
- **Manual fallback** — paste CSV or custom URL if live sync fails

## Team setup (one time)

### 1. Google Sheet columns

| Column | Purpose |
|---|---|
| Name | Contact name |
| Phone | Required |
| Business | Optional |
| Status | Written by the app (`interested`, `no answer`, `skipped`, etc.) |
| Called By | Team member name |
| Notes | Optional — call notes appended here |

Set sharing to **Anyone with the link — Viewer**.

### 2. Apps Script write-back

1. Open the sheet → **Extensions → Apps Script**
2. Paste `google-apps-script/Code.gs` from this repo
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the deployment URL

### 3. Vercel environment variables

In your Vercel project → Settings → Environment Variables:

| Variable | Example |
|---|---|
| `TEAM_PASSCODE` | `PULSE` |
| `SHEET_WRITE_URL` | `https://script.google.com/macros/s/.../exec` |
| `VITE_SHEET_URL` | `https://docs.google.com/spreadsheets/d/.../edit` |

Redeploy after adding variables.

### 4. Local dev

Copy `.env.example` to `.env.local` and fill in the same values.

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub → connect at [vercel.com](https://vercel.com).

- Build: `npm run build`
- Output: `dist`

## Solo mode

If `VITE_SHEET_URL` is not set, the app runs in solo mode with paste/URL loading and local persistence only — no passcode or sheet write-back.

## Billing note (Places API)

Call Queue does **not** call Google Places / Maps APIs. Charges on GCP project `intelligence-ai-outbound` came from the **scraper** using Places API keys. To turn Places off completely (disable APIs, revoke keys, remove scraper calls), see [docs/PLACES_BILLING.md](docs/PLACES_BILLING.md).
