# Deployment automation

## One command (after logins)

```bash
npm run setup:team
```

This will:
1. Ensure you're logged into `clasp` and Vercel
2. Create/push an Apps Script project bound to your sheet
3. Deploy it as a web app
4. Set `TEAM_PASSCODE`, `SHEET_WRITE_URL`, `VITE_SHEET_URL` on Vercel
5. Trigger a production redeploy

## First-time logins (browser required)

```bash
# Google Apps Script CLI — opens browser
npm run clasp:login

# Vercel — opens browser (skip if already logged in)
npm run vercel:login
```

Then enable the Apps Script API if Google asks:
https://script.google.com/home/usersettings → turn **Google Apps Script API** ON

## What you still click by hand

| Step | Why |
|---|---|
| Sheet sharing → Anyone with the link → Viewer | Faster in Sheets UI than scripting Drive permissions |
| Confirm columns: Status, Called By, Notes | One-time sheet structure |
| Approve OAuth consent in browser | CLIs cannot authenticate as you |

## Manual fallback commands

```bash
# Push Apps Script only
npm run clasp:push

# Deploy new web app version
npm run clasp:deploy

# List Vercel env vars
npm run vercel:env

# Redeploy production
npm run vercel:deploy
```
