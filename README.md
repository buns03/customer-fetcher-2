# Canvas Student Lookup (single-login scraper)

Tests whether scraping a Canvas login works, using ONE known student
number (used as both username and password) at a time. It does not
generate or try ranges/combinations of credentials.

## Setup

```bash
cd server
npm install        # also runs `playwright install chromium`
npm run dev         # starts API on http://localhost:4000

cd ../client
npm install
npm run dev          # starts UI on http://localhost:5173
```

Open http://localhost:5173, enter a full student number (e.g. `43560100`),
and click Lookup. The server launches a headless Chromium, logs into
https://laconcepcioncollege.instructure.com/login/canvas, and returns the
logged-in user's display name.

## Notes / things to check before using this for real

- **Terms of Service**: Canvas is hosted by Instructure. Automated login
  scraping may violate Instructure's or your institution's acceptable-use
  policies even for accounts you're authorized to access. Check with your
  IT/compliance team first.
- **Selectors may drift**: `server/src/scraper.ts` uses Canvas's default
  field names/selectors as of now. If Instructure changes their markup,
  update the selectors there.
- **One login per request**: there's a basic in-memory lock + cooldown in
  `server/src/index.ts` so this can't accidentally be turned into a
  batch/brute-force tool. If you need to look up many *known* student
  numbers (e.g. from your own roster), loop on the client/caller side with
  deliberate delays between requests — don't remove the cooldown.
