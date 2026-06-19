# AGP Astro Client Site

This is an Alloy Growth Partners client website project built on the AGP Astro starter template.

## When asked to "kick off" a client

Run `scripts/kickoff.py` in non-interactive mode. Do not ask what deliverable they want — the kickoff script handles everything.

Steps:
1. Check `exports/` for a Screaming Frog CSV (`sf_*.csv`) — auto-detected
2. Check `_client/` for a master brief (`master_brief.*`) — auto-detected
3. If either is missing, ask the user before proceeding
4. Ahrefs API key: `3myKzF_dndiUi6Es5w9gHwukKT1Ygw0pZcpBTWRN`
5. Run the script via bash:

```bash
cd /path/to/repo && python3 scripts/kickoff.py \
  --name "CLIENT NAME" \
  --domain "clientdomain.com" \
  --owner "Skyler" \
  --twitter "@handle" \
  --phone "(XXX) XXX-XXXX" \
  --city "City" \
  --state "ST" \
  --description "Meta description here" \
  --tagline "Short tagline here" \
  --notify "notify@email.com" \
  --ahrefs-api-key "KEY_FROM_MEMORY" \
  --yes
```

Pass `--sf-export` and/or `--brief` flags if those files were found or provided.

## What kickoff.py does

1. Generates `_build/{slug}_seo_tracker.xlsx`
2. Generates `_build/{slug}_launch_readiness.html` (with Ahrefs backlink data)
3. Copies master brief to `_build/` if present
4. Updates `astro.config.mjs`, `src/config/site.ts`, `src/lib/email.config.ts`, `package.json`
5. Writes `.env` with integration keys

## Project structure

```
exports/          ← Drop Screaming Frog CSV here before kickoff (gitignored)
_client/          ← Drop master brief here before kickoff
_build/           ← Generated outputs (gitignored)
scripts/
  kickoff.py      ← Main entry point — run this for every new client
  setup.py        ← Called by kickoff.py
  build_launch_checker.py
  build_seo_tracker.py
src/
  config/site.ts  ← All SEO + org defaults
  lib/email.config.ts
```

## After kickoff — what still needs human hands

- Add logo → `public/assets/logo.svg`
- Add OG image → `public/assets/og.png` (1200×630px)
- Add favicon → `public/assets/favicon.png`
- Set up Resend DNS for the client domain
- Add env vars to Vercel (copy from `.env`, set `PUBLIC_ENV=production` on prod project)
- Add `FORM_ALERT_SLACK_URL` to Vercel — the same Slack Incoming Webhook URL the `resend-slack-alerts` project uses, so form send-failure alerts land in the same channel. Leave blank to disable (forms still work). The helper is `src/lib/form-alert.ts`, already wired into all three API routes (contact/lead/subscribe).

## Booking availability admin (`/admin/booking`)

Lets the shop control online-booking availability themselves — **no code deploy**. They
log in and set the **earliest bookable date** and **closed/blackout dates**; both are
blocked on the `/appointments` calendar (past dates are always blocked too).

- **Shop URL:** `mygermancarsa.com/admin/booking` — unlisted, `noindex`, kept out of the
  sitemap. Log in with the shop password → set the earliest date + any closed dates →
  **Save changes**. Saving writes straight to Edge Config (no Vercel build) and is live on
  the site within a few seconds. **Log out** clears the session (it also clears when the
  browser tab is closed).
- **Login:** client-side gate over a server-checked password (`POST` with `verify=1`). The
  session password lives in `sessionStorage` for that tab only. The real protection is
  server-side: every write re-checks the password, so the page being viewable without a
  login leaks nothing (the dates it shows are already public on the calendar).
- **Storage:** a Vercel **Edge Config** store (`gcs-booking`) with keys `bookingFloor`
  (YYYY-MM-DD) and `blackoutDates` (string[]). The calendar reads it via
  `GET /api/booking-config`; if the store is unreachable it falls back to the baked-in
  date in `src/lib/booking-config.ts`, so the calendar can never break.
- **Write path:** `POST /api/admin/booking` validates password + dates, then upserts both
  keys via the Vercel REST API.
- **Calendar component:** `public/date-picker.js` (`window.initDatePicker`) is shared by the
  appointments form and the admin page. Supports `floor` / `cap` / `isDisabled`, so future
  rules (closed weekdays, an end date) are options, not a rewrite.
- **Required Vercel env** (read path is public; write/login needs the rest):
  - `EDGE_CONFIG` — read connection string for the store
  - `VERCEL_API_TOKEN` — Vercel API token with write access (made in the dashboard)
  - `VERCEL_TEAM_ID` — team that owns the store
  - `ADMIN_BOOKING_PASSWORD` — the shop's password for the page
- **Change the password:** update `ADMIN_BOOKING_PASSWORD` in Vercel — takes effect on the
  next request, no redeploy. See `.env.example` for full setup steps.
