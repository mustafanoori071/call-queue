# Why you were charged $111.87 (Places API)

## Short answer

Your **scraper** in GCP project **intelligence-ai-outbound** called the **Google Places (Place Details)** API with your API keys between **July 1–18, 2026**. It requested fields that bill under three SKUs:

| SKU | Amount | What the scraper likely asked for |
|---|---|---|
| Places Details | $46.39 | Base Place Details lookup per business |
| Atmosphere Data | $40.92 | Rating, reviews, amenities, price level, editorial summary, etc. |
| Contact Data | $24.56 | Phone number, website, opening hours |

Total: **$111.87**. Same as the prior period (June 13–30), so the scraper (or a schedule that runs it) has been using Places repeatedly — not a one-off glitch.

All three line items are tagged to project **intelligence-ai-outbound**, region **us-west1**.

## Why it wasn’t free

Google Places is **not unlimited free**. People often remember the old **$200/month Maps credit**; that credit was **removed on March 1, 2025**.

What you get now:

- A small **free monthly allowance per SKU** (roughly: Essentials ~10k calls, Pro ~5k, Enterprise ~1k — exact caps depend on the SKU)
- After that, **pay-as-you-go**
- Free caps are **not pooled** — Contact and Atmosphere each burn their own allowance
- Scrapers that pull phone + website + ratings for many businesses blow past free tiers quickly

Your bill’s SKU names (**Places Details**, **Contact Data**, **Atmosphere Data**) match Place Details calls that request **contact** and **atmosphere** fields. Those are the expensive add-ons. A scraper that only needed name/address would cost far less (or stay in free tier longer).

So: the API keys worked; Google just started (or continued) charging once usage exceeded free thresholds for those SKUs.

## How Places billing works (why three SKUs)

Place Details pricing is driven by the **field mask** (or `fields=`) on each request. Asking for contact or atmosphere fields adds those SKUs on top of the base Details charge. Common scraper patterns that create this exact bill:

- Requesting “everything” / omitting a tight field mask
- Enriching every lead with phone + website + rating/reviews
- Re-fetching the same place IDs without caching
- Running the scraper over a large sheet/list more than once

## This repo is not the source

Call Queue only:

- Reads leads from a Google Sheet
- Writes status/notes via Apps Script
- Opens a normal Google web search on “Look up” (no Places API key)

There is **no** Places API client, Maps key, or `intelligence-ai-outbound` reference in this codebase. The charge comes from your **scraper / enrichment** tooling that uses Places API keys under that GCP project — Call Queue only consumes the sheet afterward.

```text
Your scraper (intelligence-ai-outbound + Places API keys)
  → Google Places Place Details API  (Details + Contact + Atmosphere)
  → Lead Google Sheet
  → Call Queue app (consumer only)
```

---

## 1. Identify the service / key making Place Details requests

Use Google Cloud Console for project **intelligence-ai-outbound**:

1. **Billing → Reports** — filter SKUs containing “Places”; confirm amounts match the table above.
2. **APIs & Services → Enabled APIs** — open **Places API** (or Places API New) → **Metrics**.
3. **APIs & Services → Credentials** — note which API keys / service accounts show Places traffic.
4. **Logging → Logs Explorer** — query for Place Details callers, for example:

```text
resource.type=("cloud_run_revision" OR "cloud_function" OR "gce_instance" OR "k8s_container")
("places.googleapis.com" OR "maps.googleapis.com" OR "placeDetails" OR "X-Goog-FieldMask")
```

5. **Cloud Run / Cloud Functions / Compute Engine / Cloud Scheduler** in **us-west1** — look for jobs that enrich business leads (phone, website, rating, reviews).

Record: credential name, service name, schedule (if any), and whether requests use a field mask.

---

## 2. Tighten the field mask (cut Atmosphere / Contact when unused)

Every Place Details request should send an explicit `X-Goog-FieldMask` (or `fields=`) with **only** columns you store.

| Need | Safer fields (examples) | Avoid unless required |
|---|---|---|
| Name + address for dialing | `id`, `displayName`, `formattedAddress`, `location` | Atmosphere (rating, reviews, amenities) |
| Phone for outbound | `nationalPhoneNumber` or `internationalPhoneNumber` | Full Contact bundle if unused |
| Website | `websiteUri` | Reviews, editorial summaries |
| Lead scoring by rating | `rating`, `userRatingCount` | Pulling reviews / photos / amenity dumps |

Rules of thumb:

- If you only need phone + name, **do not** request Atmosphere fields — that alone can remove the ~$40 Atmosphere line.
- Never omit the field mask; an empty/missing mask can bill the highest applicable SKUs.
- Prefer Place Details Essentials/Pro fields over Enterprise + Atmosphere when possible.

After changing masks, re-check Billing → Reports for Contact / Atmosphere SKUs over the next billing window.

---

## 3. Cache place IDs and stop re-enriching existing rows

Places charges scale with **request count**. Prevent repeat lookups:

1. Store `place_id` (and enriched fields) on the sheet/DB row the first time you enrich.
2. Skip enrichment when `place_id` or phone already exists.
3. Deduplicate by place ID / normalized business name + city before calling Places.
4. Cap batch jobs (e.g. max N Place Details calls per run) and log skipped vs fetched counts.
5. Do not re-run full-sheet enrichment on a schedule unless new rows were added.

Pseudo-policy for enrichment jobs:

```text
for each lead:
  if place_id or phone already present → skip
  else → Place Details with minimal field mask → write fields + place_id
```

---

## 4. Budget alerts and API key restrictions

### Billing budget (prevent surprise bills)

1. Google Cloud Console → **Billing → Budgets & alerts**
2. Create a budget scoped to project **intelligence-ai-outbound**
3. Suggested thresholds: 50%, 90%, 100% of a monthly cap you choose (e.g. $25–$50 if enrichment should be light)
4. Add email (and Pub/Sub if you want automated disable later)

### Quotas

1. **APIs & Services → Places API → Quotas**
2. Lower the daily Place Details quota to a level that matches expected new leads (not “unlimited”)

### API key hardening

1. **APIs & Services → Credentials** → open the key used for Places
2. Restrict **API restrictions** to Places API only (remove unused APIs)
3. Add **Application restrictions** (HTTP referrers for browsers, or IP / none for server keys — prefer server-side keys never embedded in clients)
4. Rotate any key that may have leaked into a frontend or public repo

### Emergency stop

If spend is still climbing:

1. Disable the Places API on the project, **or**
2. Delete / restrict the active API key, **or**
3. Pause the Cloud Scheduler / job that runs enrichment

---

## Checklist summary

- [ ] Confirm Places traffic in `intelligence-ai-outbound` (Reports + Metrics + Logs)
- [ ] Identify credential + service in `us-west1`
- [ ] Set minimal field mask; drop Atmosphere if unused
- [ ] Cache `place_id`; skip rows that already have phone/details
- [ ] Add billing budget alerts
- [ ] Cap Places quotas; restrict API keys
