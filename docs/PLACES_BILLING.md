# Stop Places API charges ($111.87)

## What happened

Your **scraper** in GCP project **intelligence-ai-outbound** used **Google Places API keys**. Place Details calls billed:

| SKU | Amount |
|---|---|
| Places Details | $46.39 |
| Atmosphere Data | $40.92 |
| Contact Data | $24.56 |
| **Total** | **$111.87** |

Places is **not free** after a small monthly allowance. Goal below: **use Places API keys = $0 forever**.

Call Queue does **not** call Places. Only the scraper does. Turn Places off in GCP and remove keys from the scraper.

---

## Do this now (kill Places billing)

Work in Google Cloud Console → project **intelligence-ai-outbound**.

### 1. Disable the Places APIs

1. **APIs & Services → Enabled APIs & services**
2. Disable every Places-related API you see, including:
   - Places API
   - Places API (New)
   - Maps JavaScript API (only if you don’t need maps elsewhere)
   - Any other Maps/Places APIs you don’t need

After disable, Place Details requests fail instead of billing.

### 2. Delete or lock the API keys

1. **APIs & Services → Credentials**
2. For each key the scraper used:
   - **Delete** the key, **or**
   - Edit → **API restrictions** → do **not** allow Places / Maps APIs (or set “Don’t allow any APIs” temporarily)
3. Rotate any key that was committed to git, `.env`, or a public config

### 3. Stop the scraper from calling Places

In the scraper repo / job (not this call-queue repo):

1. Remove env vars like `GOOGLE_MAPS_API_KEY`, `PLACES_API_KEY`, `MAPS_API_KEY`, etc.
2. Delete code paths that call:
   - `places.googleapis.com`
   - `maps.googleapis.com`
   - Place Details / Text Search / Nearby Search / Find Place
3. Pause Cloud Scheduler / cron / Cloud Run jobs that run enrichment until Places is gone from the code

Without keys + with APIs disabled, even an old scraper binary cannot bill you.

### 4. Optional safety net

1. **Billing → Budgets & alerts** on `intelligence-ai-outbound` — e.g. alert at $5 and $10
2. **Places API → Quotas** → set daily quota to **0** if the API must stay listed but unused

---

## Verify spend is dead

1. Run the scraper once after the changes — it should **error** on Places (or skip enrichment), not succeed
2. **Billing → Reports** next day: Places Details / Contact / Atmosphere should be **$0**
3. **APIs & Services → Places → Metrics**: request count should be **0**

---

## Checklist

- [ ] Disable Places API (+ Places API New) on `intelligence-ai-outbound`
- [ ] Delete or restrict scraper API keys (no Places allowed)
- [ ] Remove Places keys/calls from the scraper code and redeploy
- [ ] Pause any scheduled enrichment jobs until confirmed clean
- [ ] Add a low billing budget alert ($5–$10)
- [ ] Confirm Billing Reports show $0 Places after the next scraper run
