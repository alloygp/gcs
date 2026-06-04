---
name: review-widget-setup
description: Set up a client page review session on a staging site. Use when an employee says something like "set up a review for [client]", "client needs to review pages X Y Z", "start a review session", "new review for [client]", "review pages for ticket [number]", or any variation of configuring which pages a client should review on a staging site. This skill updates review.ts via the GitHub API and returns the exact URL to send the client.
---

# Review Setup Skill

This skill configures the Alloy Preview Review Widget for a client review session. It updates `src/config/review.ts` directly on GitHub via the API — no mounted folders, no Terminal, no git credentials needed.

---

## What you need from the employee

Before doing anything, make sure you have:

1. **Client name** — e.g. "Keys-Caldwell"
2. **Pages to review** — full staging URLs preferred (e.g. `https://stg-keys-caldwell.alloygp.co/about/`), but plain paths work too
3. **Zendesk ticket ID** — required. Used to build the URL and link submission back to the ticket.

If any are missing, ask before proceeding.

---

## Repo + auth config

**GitHub PAT** (Contents: read/write on all alloygp repos):
```
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
```

> If this token has expired or returns a 401, ask Skyler to rotate it and update this file.

### Naming convention (all new clients)

Given a client name, derive repo and stg URL automatically:
- Slug: lowercase, spaces and special chars → hyphens (e.g. "Micro HOA" → `micro-hoa`)
- Repo: `alloygp/{slug}-astro`
- stg URL: `https://stg-{slug}.alloygp.co`

### Exceptions (existing clients that predate the convention)

| Client name | Repo | stg URL |
|-------------|------|---------|
| _(add any non-standard clients here as needed)_ | | |

If the employee provides a client name, check exceptions first, then fall back to the convention. If you're unsure whether the repo exists, verify via the GitHub API before proceeding — if it 404s, ask the employee for the correct repo name.

---

## What to do

### Step 1 — Extract paths from provided URLs

Strip the domain from any full URLs, normalize to paths with leading and trailing `/`:

- `https://stg-keys-caldwell.alloygp.co/about/` → `/about/`
- `https://stg-keys-caldwell.alloygp.co/` → `/`
- `/hoa-management/` → `/hoa-management/` (already clean)

Derive a human-readable `label` from the last path segment, title-cased, hyphens to spaces:
- `/` → `Homepage`
- `/about/` → `About`
- `/hoa-management/` → `HOA Management`
- `/services/financial-reporting/` → `Financial Reporting`

### Step 2 — Get the current file SHA

Run this in bash to read the current `review.ts` and get its SHA (required for the update):

```python
python3 - <<'EOF'
import json, urllib.request

PAT = "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"
REPO = "alloygp/keys-caldwell-astro"

req = urllib.request.Request(
    f"https://api.github.com/repos/{REPO}/contents/src/config/review.ts?ref=stg",
    headers={"Authorization": f"Bearer {PAT}", "Accept": "application/vnd.github+json"}
)
with urllib.request.urlopen(req) as r:
    d = json.loads(r.read())
    print("SHA:", d["sha"])
    import base64
    content = base64.b64decode(d["content"]).decode()
    # Extract PASTEL_BASE value
    for line in content.split("\n"):
        if "PASTEL_BASE" in line and "export const" in line:
            print("PASTEL_BASE line:", line.strip())
            break
EOF
```

Note the SHA and PASTEL_BASE value for the next step.

### Step 3 — Write the updated review.ts

Build the new file content with only the pages being reviewed (all `review: true`). Preserve the `PASTEL_BASE` value from Step 2.

```python
python3 - <<'EOF'
import json, base64, urllib.request

PAT = "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"
REPO = "alloygp/keys-caldwell-astro"
SHA = "REPLACE_WITH_SHA_FROM_STEP_2"
PASTEL_BASE = "REPLACE_WITH_PASTEL_BASE_FROM_STEP_2"
TICKET_ID = "REPLACE_WITH_TICKET_ID"

# Build REVIEW_ITEMS from the pages the employee provided
# Replace this list with the actual pages
ITEMS = [
    ("Homepage",       "/"),
    ("About",          "/about/"),
    ("HOA Management", "/hoa-management/"),
]

items_ts = "\n".join(
    f"  {{ label: '{label}', path: '{path}', review: true }},"
    for label, path in ITEMS
)

new_content = f"""export const PASTEL_BASE = '{PASTEL_BASE}';
export const TICKET_ID   = '{TICKET_ID}';

export interface ReviewItem {{
  label: string;
  path: string;
  review: boolean;
}}

export const REVIEW_ITEMS: ReviewItem[] = [
{items_ts}
];
"""

def api(method, endpoint, data=None):
    url = f"https://api.github.com/repos/{REPO}/{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        method=method,
        headers={{
            "Authorization": f"Bearer {{PAT}}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json"
        }}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# Push to stg
page_labels = ", ".join(label for label, _ in ITEMS)
result = api("PUT", "contents/src/config/review.ts", {{
    "message": f"review: {{page_labels}} for ticket {{TICKET_ID}}",
    "content": base64.b64encode(new_content.encode()).decode(),
    "sha": SHA,
    "branch": "stg"
}})
commit_sha = result["commit"]["sha"]
print("✓ Pushed to stg:", commit_sha)

# Force-sync dev to match stg
api("PATCH", "git/refs/heads/dev", {{"sha": commit_sha, "force": True}})
print("✓ dev synced")
EOF
```

Fill in `SHA`, `PASTEL_BASE`, `TICKET_ID`, and the `ITEMS` list before running.

### Step 4 — Return the URL

Return the `PASTEL_BASE` value read in Step 2, stripping the trailing `#` if present. This is the permanent client URL — no ticket ID, no query params needed.

```
https://usepastel.com/link/[client-link]/
```

---

## Output format

Keep it short:

---
**Pages set for review:** Homepage, HOA Management, Support

**Pushed to stg ✓** — Vercel will deploy in ~60 seconds.

**Send this URL to the client:**
```
https://usepastel.com/link/opjd87ro/
```
---

---

## How the widget works (context)

- Widget is injected on every page via `BaseLayout.astro`
- Only pages with `review: true` in `review.ts` appear in the widget
- If no items have `review: true`, the widget doesn't appear at all
- The `?review=` param is the Zendesk ticket ID — saved to localStorage on first load
- Client checks off pages as they review, then hits "Submit review to Alloy"
- On submit: Slack notification fires + Zendesk ticket gets a comment
- All localStorage clears after submission so the next review starts fresh

## Zendesk ticket workflow

1. In Zendesk, apply the macro **"Start a review ticket"** — leave requester blank (defaults to you), set status to **New**, create the ticket. Note the ticket ID from the URL.
2. Run this skill with the pages + ticket ID
3. Reply to the Zendesk ticket with the staging URL — client clicks it, ID persists automatically

## Adding a new client

Nothing to update for new clients — the naming convention handles them automatically. Only add a row to the exceptions table if the client's repo or stg URL doesn't follow the `{slug}-astro` / `stg-{slug}.alloygp.co` pattern.
