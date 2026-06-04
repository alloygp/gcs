"""
AGP Launch Readiness Checker
==============================
Generates a branded HTML pre-launch readiness report for any AGP Astro client site.

Usage (basic — no old-site data):
  python scripts/build_launch_checker.py "Client Name" "clientdomain.com" ["Owner"]

Usage (Ahrefs auto-fetch via API — recommended on kickoff):
  AHREFS_API_KEY=your_key python scripts/build_launch_checker.py "Client Name" "clientdomain.com"
  # or
  python scripts/build_launch_checker.py "Client Name" "clientdomain.com" --ahrefs-api-key your_key

Usage (full — API + Screaming Frog once crawl is available):
  python scripts/build_launch_checker.py "Client Name" "clientdomain.com" "Owner" \\
    --sf-export exports/internal.csv

Usage (manual CSV fallback — no API key):
  python scripts/build_launch_checker.py "Client Name" "clientdomain.com" "Owner" \\
    --sf-export exports/internal.csv \\
    --ahrefs-export exports/best_by_links.csv

Ahrefs API key:
  Set AHREFS_API_KEY env var (or pass --ahrefs-api-key). The script calls the v3 API
  automatically and fetches "Best by Links" data — no manual CSV export needed.
  Get your key at https://ahrefs.com/api

Screaming Frog export instructions:
  1. Crawl the OLD (current live) client domain in Screaming Frog
  2. Set filter: Internal → HTML
  3. File → Export → Export All (CSV)
  Save as e.g. exports/sf_internal.csv

Output:
  _build/{slug}_launch_readiness.html

What it generates:
  - Cover section with live score cards
  - Pre-launch technical checklist (23 items, universal)
  - Must-live pages table (auto-populated if data provided)
  - Full redirect inventory (all old HTML pages from SF crawl)
  - Launch phase cards (blank — fill in per project)
"""

import sys, os, re, csv, json
import urllib.request, urllib.parse
from datetime import date

# ── Args ──────────────────────────────────────────────────────────────────────
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)

CLIENT_NAME   = sys.argv[1].strip()
CLIENT_DOMAIN = re.sub(r"^https?://", "", sys.argv[2].strip()).rstrip("/")
OWNER         = sys.argv[3].strip() if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else "Skyler"
BASE_URL      = f"https://{CLIENT_DOMAIN}"
SLUG          = re.sub(r"[^a-z0-9]+", "_", CLIENT_NAME.lower()).strip("_")
TODAY         = date.today().strftime("%B %-d, %Y")

# Optional CSV + API flags
sf_path      = None
ahrefs_path  = None
ahrefs_key   = os.environ.get("AHREFS_API_KEY", "")
for i, arg in enumerate(sys.argv):
    if arg == "--sf-export" and i + 1 < len(sys.argv):
        sf_path = sys.argv[i + 1]
    elif arg == "--ahrefs-export" and i + 1 < len(sys.argv):
        ahrefs_path = sys.argv[i + 1]
    elif arg == "--ahrefs-api-key" and i + 1 < len(sys.argv):
        ahrefs_key = sys.argv[i + 1]

ROOT      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD_DIR = os.path.join(ROOT, "_build")
os.makedirs(BUILD_DIR, exist_ok=True)
OUT_PATH  = os.path.join(BUILD_DIR, f"{SLUG}_launch_readiness.html")


# ══════════════════════════════════════════════════════════════════════════════
# CSV PARSING
# ══════════════════════════════════════════════════════════════════════════════

def normalize_url(url, domain=None):
    """Strip protocol + domain + trailing slash, lowercase. Returns /path form."""
    url = url.strip()
    url = re.sub(r"^https?://[^/]+", "", url)  # strip protocol + domain
    url = url.rstrip("/") or "/"               # strip trailing slash, keep root
    url = url.lower()
    return url

def find_col(header_row, *candidates):
    """Case-insensitive column finder. Returns the first matching header name."""
    lower = {h.lstrip("﻿").strip().lower(): h.lstrip("﻿").strip() for h in header_row}
    for c in candidates:
        if c.lower() in lower:
            return lower[c.lower()]
    return None

def parse_screaming_frog(path):
    """
    Parse a Screaming Frog 'Internal' CSV export.
    Returns a dict: { '/path': { url, title, inlinks, status, depth } }
    Only includes HTML pages with status 200.
    """
    pages = {}
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []

            col_url      = find_col(headers, "Address", "URL")
            col_status   = find_col(headers, "Status Code", "Status")
            col_content  = find_col(headers, "Content", "Content Type")
            col_title    = find_col(headers, "Title 1", "Title", "Meta Title 1")
            col_inlinks  = find_col(headers, "Unique Inlinks", "Inlinks", "Unique Internal Inlinks")
            col_depth    = find_col(headers, "Crawl Depth", "Depth")

            if not col_url:
                print(f"  ⚠ SF export: could not find URL column in {path}")
                return pages

            for row in reader:
                status  = str(row.get(col_status, "")).strip()
                content = str(row.get(col_content, "")).strip().lower()

                # Only keep HTML 200s
                if status != "200":
                    continue
                if col_content and "html" not in content:
                    continue

                raw_url = row.get(col_url, "").strip()
                if not raw_url:
                    continue

                path_key = normalize_url(raw_url)
                inlinks  = 0
                if col_inlinks:
                    try:
                        inlinks = int(str(row.get(col_inlinks, "0")).replace(",", "").strip() or "0")
                    except ValueError:
                        inlinks = 0

                depth = 0
                if col_depth:
                    try:
                        depth = int(str(row.get(col_depth, "0")).strip() or "0")
                    except ValueError:
                        depth = 0

                pages[path_key] = {
                    "url":      path_key,
                    "full_url": raw_url,
                    "title":    str(row.get(col_title, "")).strip() if col_title else "",
                    "inlinks":  inlinks,
                    "depth":    depth,
                    "ref_domains": 0,
                    "traffic":  0,
                }

    except FileNotFoundError:
        print(f"  ⚠ SF export file not found: {path}")
    except Exception as e:
        print(f"  ⚠ SF export parse error: {e}")

    return pages

def parse_ahrefs(path):
    """
    Parse an Ahrefs 'Best by Links' CSV export.
    Returns a dict: { '/path': { url, title, ref_domains, traffic } }
    """
    pages = {}
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []

            col_url     = find_col(headers, "URL", "Address")
            col_title   = find_col(headers, "Title", "Page title")
            col_refs    = find_col(headers, "Referring domains", "Ref. domains", "Refdomains", "Dofollow referring domains")
            col_traffic = find_col(headers, "Traffic", "Organic traffic", "Est. organic traffic")
            col_kw      = find_col(headers, "Top keyword", "Top Keyword")

            if not col_url:
                print(f"  ⚠ Ahrefs export: could not find URL column in {path}")
                return pages

            for row in reader:
                raw_url = row.get(col_url, "").strip()
                if not raw_url:
                    continue

                path_key = normalize_url(raw_url)

                ref_domains = 0
                if col_refs:
                    try:
                        ref_domains = int(str(row.get(col_refs, "0")).replace(",", "").strip() or "0")
                    except ValueError:
                        ref_domains = 0

                traffic = 0
                if col_traffic:
                    try:
                        traffic = int(str(row.get(col_traffic, "0")).replace(",", "").strip() or "0")
                    except ValueError:
                        traffic = 0

                pages[path_key] = {
                    "url":        path_key,
                    "full_url":   raw_url,
                    "title":      str(row.get(col_title, "")).strip() if col_title else "",
                    "ref_domains": ref_domains,
                    "traffic":    traffic,
                    "top_kw":     str(row.get(col_kw, "")).strip() if col_kw else "",
                    "inlinks":    0,
                }

    except FileNotFoundError:
        print(f"  ⚠ Ahrefs export file not found: {path}")
    except Exception as e:
        print(f"  ⚠ Ahrefs export parse error: {e}")

    return pages

def fetch_ahrefs_api(domain, api_key, limit=1000):
    """
    Auto-fetch top pages data from the Ahrefs v3 API (top-pages endpoint).
    Returns a dict in the same format as parse_ahrefs(): { '/path': { ... } }
    Docs: https://docs.ahrefs.com/docs/api/site-explorer
    """
    import datetime
    pages = {}
    if not api_key:
        return pages

    try:
        date = datetime.date.today().isoformat()
        params = urllib.parse.urlencode({
            "select":   "url,top_keyword_best_position_title,referring_domains,sum_traffic,top_keyword",
            "target":   domain,
            "mode":     "domain",
            "limit":    limit,
            "date":     date,
            "order_by": "referring_domains:desc",
        })
        url = f"https://api.ahrefs.com/v3/site-explorer/top-pages?{params}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {api_key}",
            "Accept":        "application/json",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        for item in data.get("pages", []):
            raw_url = item.get("url", "").strip()
            if not raw_url:
                continue
            path_key = normalize_url(raw_url)
            pages[path_key] = {
                "url":         path_key,
                "full_url":    raw_url,
                "title":       item.get("top_keyword_best_position_title", "") or "",
                "ref_domains": int(item.get("referring_domains", 0) or 0),
                "traffic":     int(item.get("sum_traffic", 0) or 0),
                "top_kw":      item.get("top_keyword", "") or "",
                "inlinks":     0,
            }

        print(f"  → Ahrefs API: {len(pages)} pages fetched for {domain}")

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  ⚠ Ahrefs API error {e.code}: {body[:200]}")
    except Exception as e:
        print(f"  ⚠ Ahrefs API fetch failed: {e}")

    return pages


def merge_page_data(sf_pages, ahrefs_pages):
    """
    Merge SF and Ahrefs data keyed on normalized URL path.
    Ahrefs ref_domains + traffic take precedence. SF inlinks fill in the rest.
    Returns a sorted list of page dicts.
    """
    merged = {}

    # Start with SF pages (all HTML 200s from old site)
    for path_key, data in sf_pages.items():
        merged[path_key] = data.copy()

    # Layer in Ahrefs data
    for path_key, data in ahrefs_pages.items():
        if path_key in merged:
            merged[path_key]["ref_domains"] = data["ref_domains"]
            merged[path_key]["traffic"]     = data["traffic"]
            merged[path_key]["top_kw"]      = data.get("top_kw", "")
            if not merged[path_key]["title"] and data["title"]:
                merged[path_key]["title"] = data["title"]
        else:
            # Ahrefs knows about this page even if SF didn't crawl it
            entry = data.copy()
            entry.setdefault("inlinks", 0)
            entry.setdefault("depth", 0)
            merged[path_key] = entry

    # Sort: ref_domains weighted 10x over inlinks (external > internal signal)
    pages = list(merged.values())
    pages.sort(key=lambda p: (p.get("ref_domains", 0) * 10 + p.get("inlinks", 0)), reverse=True)

    return pages

def priority_badge(ref_domains, inlinks, traffic=0):
    """Return badge HTML based on SEO signal strength."""
    if ref_domains >= 5 or inlinks >= 50 or traffic >= 200:
        return '<span class="badge must">MUST LIVE</span>'
    elif ref_domains >= 1 or inlinks >= 15:
        return '<span class="badge p1">HIGH</span>'
    else:
        return '<span class="badge p2">STANDARD</span>'

def priority_sort_key(ref_domains, inlinks, traffic=0):
    if ref_domains >= 5 or inlinks >= 50 or traffic >= 200:
        return 0
    elif ref_domains >= 1 or inlinks >= 15:
        return 1
    return 2


# ══════════════════════════════════════════════════════════════════════════════
# LOAD CSV DATA
# ══════════════════════════════════════════════════════════════════════════════

sf_data = parse_screaming_frog(sf_path) if sf_path else {}

# Ahrefs: prefer manual CSV export, auto-fetch via API if key is available
if ahrefs_path:
    ahrefs_data = parse_ahrefs(ahrefs_path)
elif ahrefs_key:
    ahrefs_data = fetch_ahrefs_api(CLIENT_DOMAIN, ahrefs_key)
else:
    ahrefs_data = {}

all_pages = merge_page_data(sf_data, ahrefs_data) if (sf_data or ahrefs_data) else []

has_data    = bool(all_pages)
total_old_pages = len(all_pages)

# Must-live: pages with any meaningful signal
must_live_pages = [
    p for p in all_pages
    if p.get("ref_domains", 0) >= 1 or p.get("inlinks", 0) >= 10 or p.get("traffic", 0) >= 50
]

# Stats for cover
ahrefs_pages_with_links = sum(1 for p in all_pages if p.get("ref_domains", 0) >= 1)


# ══════════════════════════════════════════════════════════════════════════════
# CHECKLIST
# ══════════════════════════════════════════════════════════════════════════════

CHECKLIST = [
    # CRITICAL
    (
        "1", "crit",
        f"Set <code>PUBLIC_ENV=production</code> on the Vercel production project",
        f"The noindex logic in BaseLayout checks for <code>PUBLIC_ENV</code>. Any deployment "
        f"where this is <em>not</em> set to <code>production</code> will be noindexed automatically — "
        f"correct for staging, but will make the live site invisible to Google if forgotten. "
        f"Before pointing the domain: Vercel → production project → Settings → Environment Variables → "
        f"add <code>PUBLIC_ENV</code> = <code>production</code>, then redeploy.",
        False
    ),
    (
        "2", "crit",
        "Confirm staging noindex is active — all staged pages noindexed",
        "Run a quick Screaming Frog crawl of the staging URL. Every HTML page should show "
        "<code>Non-Indexable · noindex</code>. If any page is indexable on staging, "
        "find and fix the <code>PUBLIC_ENV</code> logic in <code>BaseLayout.astro</code>.",
        False
    ),
    (
        "3", "crit",
        "Full Screaming Frog crawl of staged site — zero nav-linked 404s",
        "Crawl the staging domain. Accept criteria: zero 404s on internal links, every page "
        "has a unique title (50–60ch), meta description (130–160ch), and H1. No redirect chains "
        "(A → B → C — fix to A → C direct). No redirect loops.",
        False
    ),
    (
        "4", "crit",
        "All redirects firing as 301s in vercel.json",
        "Every old URL in the redirect map must return a 301 (not 302, not 404). "
        f"Test the highest-signal URLs manually with <code>curl -I https://stg-{SLUG}.alloygp.co/old-path</code>. "
        "Verify redirect chains are collapsed — no A → B → C hops.",
        False
    ),
    (
        "5", "crit",
        "Schema markup implemented and validated",
        "All pages must emit <code>LocalBusiness</code> JSON-LD via BaseLayout. Service pages "
        "need <code>Service</code> + <code>BreadcrumbList</code>. FAQ pages need <code>FAQPage</code>. "
        "Blog/article pages need <code>Article</code>. Validate each type at "
        "<a href='https://search.google.com/test/rich-results' target='_blank'>Google Rich Results Test</a>.",
        False
    ),
    # HIGH
    (
        "6", "high",
        f"Fill in <code>src/config/site.ts</code> — all TODO values replaced",
        f"Every field that reads TODO must be replaced: name, url, twitterHandle, "
        f"defaultDescription, telephone, email, addressLocality, addressRegion. "
        f"The <code>url</code> field must be exactly <code>{BASE_URL}</code> with no trailing slash.",
        False
    ),
    (
        "7", "high",
        "OG image exists at <code>public/assets/og.png</code> (1200×630px, under 300KB)",
        "Check with <code>ls public/assets/og.png</code>. Verify it renders correctly at "
        "<a href='https://www.opengraph.xyz' target='_blank'>opengraph.xyz</a>. "
        "Must be PNG, 1200×630px, under 300KB.",
        False
    ),
    (
        "8", "high",
        "Favicon exists at <code>public/assets/favicon.png</code>",
        "Minimum 32×32px square PNG. Confirm it renders in the browser tab on staging.",
        False
    ),
    (
        "9", "high",
        "Connect & configure Resend — all contact/lead forms tested end-to-end",
        f"Wire Resend API to all forms: /request-a-proposal and any other contact or lead forms. "
        f"Set up domain authentication (SPF/DKIM) in Resend for <code>{CLIENT_DOMAIN}</code>. "
        f"Configure destination email address(es), reply-to headers, and notification templates "
        f"in <code>src/lib/email.config.ts</code>. Test every form submission end-to-end before launch.",
        False
    ),
    (
        "10", "high",
        "All Vercel environment variables set on the production project",
        "Required: <code>RESEND_API_KEY</code>, <code>MAILCHIMP_API_KEY</code>, "
        "<code>MAILCHIMP_SERVER_PREFIX</code>, <code>MAILCHIMP_AUDIENCE_ID</code>, "
        "<code>INTERNAL_NOTIFY_EMAIL</code>, <code>PUBLIC_ENV=production</code>. "
        "Optional: <code>GA_MEASUREMENT_ID</code>. "
        "Verify: Vercel → project → Settings → Environment Variables.",
        False
    ),
    (
        "11", "high",
        f"<code>robots.txt</code> Sitemap line points to <code>{BASE_URL}/sitemap.xml</code>",
        f"The Sitemap directive must read: <code>Sitemap: {BASE_URL}/sitemap.xml</code>. "
        f"Confirm <code>Disallow: /api/</code> is present. "
        f"Do NOT disallow <code>/assets/</code> — blocks Google from crawling images.",
        False
    ),
    (
        "12", "high",
        "Sitemap updated with all live indexable pages",
        "Every live, non-redirected, non-noindexed page must be in <code>sitemap.xml</code> "
        "(or auto-generated by <code>@astrojs/sitemap</code>). "
        "Exclude: 404, API routes, paginated duplicates. "
        "Submit to Google Search Console immediately after launch.",
        False
    ),
    (
        "13", "high",
        "Google Analytics GA4 wired — measurement ID in BaseLayout",
        "Paste the <code>G-XXXXXXXXXX</code> measurement ID into the analytics block in "
        "<code>src/layouts/BaseLayout.astro</code> (or set as <code>GA_MEASUREMENT_ID</code> env var). "
        "Verify events are firing in GA4 Realtime after staging deploy.",
        False
    ),
    (
        "14", "high",
        "Google Search Console — new property added and verified",
        "Add the production domain as a new property in GSC. Verify ownership via DNS TXT record. "
        "Submit <code>sitemap.xml</code> immediately post-launch. "
        "If migrating domains, use the GSC Change of Address tool.",
        False
    ),
    # MEDIUM
    (
        "15", "med",
        "All images have descriptive alt text",
        "Screaming Frog → Images report. Zero images with blank alt text "
        "(purely decorative images get <code>alt=\"\"</code>). "
        "Priority: homepage hero, team photos, service page images.",
        False
    ),
    (
        "16", "med",
        "Canonical tags correct on all pages",
        "Every page must have a self-referencing canonical. Verify no pages canonicalize "
        "to a 404 or redirect chain. Confirm <code>Astro.site</code> is set in "
        "<code>astro.config.mjs</code> — without it, canonical URLs will be relative.",
        False
    ),
    (
        "17", "med",
        f"Resend domain DNS authenticated (SPF/DKIM) for transactional email",
        f"In Resend → Domains, add <code>{CLIENT_DOMAIN}</code> and follow the DNS steps. "
        f"SPF and DKIM records must pass verification before forms go live.",
        False
    ),
    (
        "18", "med",
        "OG/social card preview verified",
        "Paste the production URL into <a href='https://www.opengraph.xyz' target='_blank'>opengraph.xyz</a>. "
        "Verify OG image, title, and description render correctly.",
        False
    ),
    (
        "19", "med",
        "www → non-www redirect configured at DNS/CDN level",
        f"Pick one canonical root: <code>{BASE_URL}</code> or <code>https://www.{CLIENT_DOMAIN}</code>. "
        f"The other must 301 to the chosen root. Configure in Vercel → project → Domains.",
        False
    ),
    (
        "20", "med",
        "Mailchimp newsletter subscribe form tested (if applicable)",
        "Test a real submission through <code>/api/subscribe</code>. Confirm the contact "
        "appears in the correct Mailchimp audience. Verify the confirmation flow.",
        False
    ),
    # POST-LAUNCH
    (
        "21", "low",
        "Post-launch: request indexing for top 10 pages in GSC",
        "Within 24 hours of launch, use GSC URL Inspection → Request Indexing on: homepage, "
        "primary service pages, /request-a-proposal/, and top geo/location pages.",
        False
    ),
    (
        "22", "low",
        "Post-launch: monitor GSC for 7 days",
        "Watch for: spike in 404 errors, noindex warnings, crawl anomalies, "
        "drops in impressions/clicks for the money keywords. Keep vercel.json ready to update quickly.",
        False
    ),
    (
        "23", "low",
        "Post-launch: run Google Rich Results Test on top 5 pages",
        "Homepage, primary service page, FAQ page (if built), and 1–2 blog posts. "
        "Confirm Organization, Service, and FAQPage schema pass.",
        False
    ),
]

total     = len(CHECKLIST)
resolved  = sum(1 for item in CHECKLIST if item[4])
open_crit = sum(1 for item in CHECKLIST if not item[4] and item[1] == "crit")
open_high = sum(1 for item in CHECKLIST if not item[4] and item[1] == "high")

SEV_LABELS  = {"crit": "Critical", "high": "High", "med": "Medium", "low": "Post-Launch"}
SEV_CLASSES = {"crit": "sev-crit", "high": "sev-high", "med": "sev-med", "low": "sev-low"}

def render_checklist():
    rows = []
    for num, sev, title, detail, done in CHECKLIST:
        resolved_style = 'style="opacity:0.55;"' if done else ""
        strike = 'style="text-decoration:line-through;"' if done else ""
        icon = "✅" if done else num
        rows.append(f"""    <div class="cl-item" {resolved_style}>
      <div class="cl-num">{icon}</div>
      <div class="cl-text">
        <strong {strike}>{title}</strong>
        <span>{detail}</span>
      </div>
      <span class="{SEV_CLASSES[sev]}">{SEV_LABELS[sev]}</span>
    </div>""")
    return "\n".join(rows)


# ══════════════════════════════════════════════════════════════════════════════
# MUST-LIVE TABLE
# ══════════════════════════════════════════════════════════════════════════════

def render_must_live_table():
    if not has_data:
        return f"""
  <div class="empty-state">→ No crawl data loaded. Re-run with --sf-export and/or --ahrefs-export to auto-populate.</div>
  <div class="tbl-wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th>Old URL</th><th>Ext. Backlinks</th><th>Int. Inlinks</th>
          <th>Traffic/mo</th><th>Priority</th>
          <th>New URL / Action</th><th>Note</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td class="code amber">/</td><td>—</td><td>—</td><td>—</td>
          <td><span class="badge must">MUST LIVE</span></td>
          <td class="code green">/</td><td>Homepage rebuild</td>
          <td style="color:var(--muted);">⬜ Not yet</td></tr>
        <tr><td colspan="8" style="text-align:center;color:var(--dim);padding:20px;font-style:italic;">
          Populate from Screaming Frog + Ahrefs exports</td></tr>
      </tbody>
    </table>
  </div>"""

    rows = []
    pages_to_show = must_live_pages if must_live_pages else all_pages[:50]

    for p in pages_to_show:
        ref  = p.get("ref_domains", 0)
        ink  = p.get("inlinks", 0)
        traf = p.get("traffic", 0)
        badge = priority_badge(ref, ink, traf)

        ref_cell  = f'<span style="color:var(--red);font-weight:700;">{ref}</span>' if ref >= 5 else (f'<span style="color:var(--amber);font-weight:700;">{ref}</span>' if ref >= 1 else str(ref))
        ink_cell  = f'<span style="color:var(--muted);">{ink}</span>'
        traf_cell = f'<span style="color:var(--green-dark);font-weight:700;">{traf:,}</span>' if traf >= 100 else (str(traf) if traf else "—")

        rows.append(f"""        <tr>
          <td class="code amber">{p['url']}</td>
          <td style="text-align:center;">{ref_cell}</td>
          <td style="text-align:center;">{ink_cell}</td>
          <td style="text-align:center;">{traf_cell}</td>
          <td>{badge}</td>
          <td class="code" style="color:var(--dim);">← fill in</td>
          <td style="color:var(--dim);font-size:11px;">{p.get('title','')[:60]}</td>
          <td style="color:var(--muted);">⬜</td>
        </tr>""")

    return f"""
  <div class="tbl-wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th>Old URL</th>
          <th style="text-align:center;">Ext. Backlinks</th>
          <th style="text-align:center;">Int. Inlinks</th>
          <th style="text-align:center;">Traffic/mo</th>
          <th>Priority</th>
          <th>New URL / Action</th>
          <th>Page Title (old)</th>
          <th>Built?</th>
        </tr>
      </thead>
      <tbody>
{"".join(rows)}
      </tbody>
    </table>
  </div>"""


# ══════════════════════════════════════════════════════════════════════════════
# REDIRECT INVENTORY
# ══════════════════════════════════════════════════════════════════════════════

def render_redirect_inventory():
    if not has_data:
        return f"""
  <div class="empty-state">→ No crawl data loaded — populate from old site Screaming Frog export.</div>
  <div class="alert info">
    <div class="alert-icon">📋</div>
    <div class="alert-body">
      <strong>vercel.json redirect format</strong>
      <pre style="background:rgba(0,0,0,0.05);border-radius:6px;padding:10px 14px;font-size:12px;margin:10px 0;overflow-x:auto;">{{
  "redirects": [
    {{ "source": "/old-path", "destination": "/new-path", "permanent": true }},
    {{ "source": "/old-section/:slug", "destination": "/new-section/:slug", "permanent": true }}
  ]
}}</pre>
    </div>
  </div>"""

    # Show all pages as a redirect inventory — sorted by signal desc
    rows = []
    for p in all_pages:
        ref  = p.get("ref_domains", 0)
        ink  = p.get("inlinks", 0)
        traf = p.get("traffic", 0)
        score = ref * 10 + ink

        if ref >= 5 or ink >= 50 or traf >= 200:
            row_class = 'style="background:var(--red-bg);"'
        elif ref >= 1 or ink >= 15:
            row_class = 'style="background:var(--amber-bg);"'
        else:
            row_class = ""

        ref_str  = f'<span style="color:var(--red);font-weight:700;">{ref}</span>' if ref >= 5 else (f'<span style="color:var(--amber);">{ref}</span>' if ref >= 1 else ("—" if ref == 0 else str(ref)))
        ink_str  = str(ink) if ink else "—"
        traf_str = f'{traf:,}' if traf else "—"

        rows.append(f"""        <tr {row_class}>
          <td class="rd-old">{p['url']}</td>
          <td style="text-align:center;">{ref_str}</td>
          <td style="text-align:center;color:var(--muted);">{ink_str}</td>
          <td style="text-align:center;">{traf_str}</td>
          <td class="rd-new" style="color:var(--dim);">← fill in</td>
          <td style="color:var(--muted);">⬜</td>
        </tr>""")

    return f"""
  <div class="alert info">
    <div class="alert-icon">📋</div>
    <div class="alert-body">
      <strong>{total_old_pages} pages found on old site · {ahrefs_pages_with_links} have external backlinks</strong>
      <p>Every row below is a URL from the old site that needs to either exist at a new URL or have a 301 in vercel.json.
      Rows highlighted <span style="background:var(--red-bg);padding:1px 6px;border-radius:3px;">red</span> have high external backlinks — these are the must-fix redirects.
      Rows highlighted <span style="background:var(--amber-bg);padding:1px 6px;border-radius:3px;">amber</span> have moderate signal.
      Fill in the "New URL" column as you build out the redirect map.</p>
    </div>
  </div>
  <div class="tbl-wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th>Old URL</th>
          <th style="text-align:center;">Ext. Backlinks</th>
          <th style="text-align:center;">Int. Inlinks</th>
          <th style="text-align:center;">Traffic/mo</th>
          <th>New URL</th>
          <th>In vercel.json?</th>
        </tr>
      </thead>
      <tbody>
{"".join(rows)}
      </tbody>
    </table>
  </div>"""


# ══════════════════════════════════════════════════════════════════════════════
# DATA SUMMARY BANNER
# ══════════════════════════════════════════════════════════════════════════════

def render_data_banner():
    parts = []
    if sf_path:
        parts.append(f"Screaming Frog: <strong>{len(sf_data)} HTML pages</strong> crawled from old site")
    if ahrefs_path:
        parts.append(f"Ahrefs CSV: <strong>{ahrefs_pages_with_links} pages</strong> with external backlinks")
    elif ahrefs_key and ahrefs_data:
        parts.append(f"Ahrefs API: <strong>{ahrefs_pages_with_links} pages</strong> with external backlinks (auto-fetched)")
    if not parts:
        return ""

    return f"""
<div class="alert info" style="margin:20px 44px 0;max-width:1160px;margin-left:auto;margin-right:auto;">
  <div class="alert-icon">📊</div>
  <div class="alert-body">
    <strong>Crawl data loaded</strong>
    <p>{" · ".join(parts)} · <strong>{len(must_live_pages)} must-live pages</strong> identified · Generated {TODAY}</p>
  </div>
</div>"""


# ══════════════════════════════════════════════════════════════════════════════
# HTML
# ══════════════════════════════════════════════════════════════════════════════

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{CLIENT_NAME} — Site Launch Readiness</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root {{
    --purple:#150828;--pink:#E94560;--green-dark:#1B4D3E;--green:#1B7A4A;
    --green-light:#4FA571;--amber:#D4850A;--blue:#1E40AF;--teal:#0E7490;
    --red:#DC2626;--bg:#FAFAF8;--surface:#FFFFFF;--alt:#F5F3EF;
    --rule:#E6E1D9;--ink:#1A1414;--muted:#5A544F;--dim:#8C8680;
    --amber-bg:#FFF8EB;--amber-border:#E8C894;
    --green-bg:#E8F5EE;--green-border:#B5D9C1;
    --blue-bg:#EFF6FF;--blue-border:#B8D1EC;
    --pink-bg:#FEF0F3;--pink-border:#F7B8C3;
    --red-bg:#FEF2F2;--red-border:#FCA5A5;
    --teal-bg:#ECFEFF;--teal-border:#A5D8E0;
    --purple-bg:#F2EFF6;--purple-border:#D4CADD;
  }}
  *,*::before,*::after{{box-sizing:border-box;}}
  html,body{{margin:0;padding:0;scroll-behavior:smooth;}}
  body{{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;font-size:15px;-webkit-font-smoothing:antialiased;}}
  h1,h2,h3,h4{{font-family:'Montserrat',sans-serif;font-weight:800;line-height:1.1;letter-spacing:-0.02em;margin:0;}}
  p{{margin:0 0 12px;}}p:last-child{{margin-bottom:0;}}
  a{{color:var(--blue);}}
  code{{font-family:'JetBrains Mono',monospace;font-size:0.85em;background:var(--alt);padding:1px 5px;border-radius:3px;}}
  .wrap{{max-width:1160px;margin:0 auto;padding:0 44px;}}
  section[id]{{scroll-margin-top:58px;}}

  .topnav{{position:sticky;top:0;z-index:50;background:rgba(250,250,248,0.97);backdrop-filter:blur(10px);border-bottom:1px solid var(--rule);}}
  .topnav-inner{{max-width:1160px;margin:0 auto;padding:0 44px;display:flex;align-items:center;justify-content:space-between;height:50px;gap:20px;}}
  .topnav-brand{{font-family:'Montserrat',sans-serif;font-weight:900;font-size:11px;color:var(--purple);white-space:nowrap;}}
  .topnav-brand span{{color:var(--pink);}}
  .topnav-links{{display:flex;gap:14px;font-family:'Montserrat',sans-serif;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;flex-wrap:wrap;}}
  .topnav-links a{{color:var(--muted);text-decoration:none;transition:color 0.1s;white-space:nowrap;}}
  .topnav-links a:hover{{color:var(--purple);}}

  .cover{{background:var(--purple);padding:64px 44px 56px;position:relative;overflow:hidden;}}
  .cover::after{{content:"";position:absolute;top:-200px;right:-200px;width:600px;height:600px;background:radial-gradient(circle,rgba(27,122,74,0.18) 0%,transparent 68%);pointer-events:none;}}
  .cover-inner{{max-width:1160px;margin:0 auto;position:relative;z-index:1;}}
  .cover-eyebrow{{font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:18px;display:flex;align-items:center;gap:10px;}}
  .cover-eyebrow::before{{content:"";width:24px;height:2px;background:rgba(255,255,255,0.3);}}
  .cover h1{{font-size:clamp(30px,4vw,48px);color:#fff;font-weight:900;margin-bottom:12px;max-width:820px;}}
  .cover h1 em{{color:var(--green-light);font-style:normal;}}
  .cover-sub{{font-size:15px;color:rgba(255,255,255,0.6);max-width:640px;margin-bottom:40px;line-height:1.6;}}
  .score-grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;max-width:900px;}}
  .score-card{{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:16px 18px;}}
  .score-card .sv{{font-family:'Montserrat',sans-serif;font-weight:900;font-size:28px;line-height:1;margin-bottom:4px;}}
  .score-card .sv.red{{color:#f87171;}}.score-card .sv.amber{{color:#fcd34d;}}.score-card .sv.green{{color:#6ee7b7;}}.score-card .sv.white{{color:#fff;}}
  .score-card .sl{{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.4);}}

  .section{{padding:52px 0;border-top:1px solid var(--rule);}}
  .eyebrow{{font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:8px;}}
  .eyebrow::before{{content:"";width:20px;height:2px;background:currentColor;}}
  .eyebrow.red{{color:var(--red);}}.eyebrow.amber{{color:var(--amber);}}.eyebrow.green{{color:var(--green);}}.eyebrow.blue{{color:var(--blue);}}
  .section h2{{font-size:clamp(22px,3vw,30px);color:var(--purple);margin-bottom:8px;}}
  .section-intro{{font-size:14px;color:var(--muted);max-width:720px;margin-bottom:28px;line-height:1.65;}}

  .alert{{border-radius:10px;padding:16px 20px;margin-bottom:16px;display:flex;gap:14px;align-items:flex-start;}}
  .alert.warn{{background:var(--amber-bg);border:1px solid var(--amber-border);border-left:4px solid var(--amber);}}
  .alert.info{{background:var(--blue-bg);border:1px solid var(--blue-border);border-left:4px solid var(--blue);}}
  .alert.ok{{background:var(--green-bg);border:1px solid var(--green-border);border-left:4px solid var(--green);}}
  .alert-icon{{font-size:18px;flex-shrink:0;margin-top:1px;}}
  .alert-body strong{{font-family:'Montserrat',sans-serif;font-size:12px;font-weight:800;display:block;margin-bottom:4px;}}
  .alert-body p{{font-size:13px;color:var(--muted);}}
  .alert.warn .alert-body strong{{color:var(--amber);}}.alert.info .alert-body strong{{color:var(--blue);}}.alert.ok .alert-body strong{{color:var(--green-dark);}}

  .tbl-wrap{{overflow-x:auto;margin-bottom:24px;border-radius:10px;border:1px solid var(--rule);}}
  table.tbl{{width:100%;border-collapse:collapse;font-size:12px;}}
  table.tbl th{{background:var(--alt);padding:10px 12px;text-align:left;font-family:'Montserrat',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--purple);border-bottom:2px solid var(--rule);white-space:nowrap;}}
  table.tbl td{{padding:9px 12px;border-bottom:1px solid var(--rule);color:var(--ink);vertical-align:top;}}
  table.tbl tr:last-child td{{border-bottom:none;}}
  table.tbl tr:hover td{{background:var(--alt);}}
  td.code{{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);}}
  td.code.amber{{color:var(--amber);}}.td.code.green{{color:var(--green-dark);}}
  .rd-old{{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--amber);word-break:break-all;}}
  .rd-new{{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--green-dark);word-break:break-all;}}
  .sev-crit{{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:800;color:var(--red);background:var(--red-bg);padding:3px 8px;border-radius:4px;white-space:nowrap;}}
  .sev-high{{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:800;color:var(--amber);background:var(--amber-bg);padding:3px 8px;border-radius:4px;white-space:nowrap;}}
  .sev-med{{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:800;color:var(--blue);background:var(--blue-bg);padding:3px 8px;border-radius:4px;white-space:nowrap;}}
  .sev-low{{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:800;color:var(--muted);background:var(--alt);padding:3px 8px;border-radius:4px;white-space:nowrap;}}
  .badge{{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;}}
  .badge.must{{background:var(--red-bg);color:var(--red);border:1px solid var(--red-border);}}
  .badge.p1{{background:var(--green-bg);color:var(--green-dark);border:1px solid var(--green-border);}}
  .badge.p2{{background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-border);}}
  .badge.p3{{background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple-border);}}

  .checklist{{display:flex;flex-direction:column;gap:6px;max-width:900px;}}
  .cl-item{{display:grid;grid-template-columns:28px 1fr auto;gap:12px;align-items:start;padding:12px 14px;background:var(--surface);border:1px solid var(--rule);border-radius:8px;}}
  .cl-item:hover{{background:var(--alt);}}
  .cl-num{{font-family:'Montserrat',sans-serif;font-weight:900;font-size:11px;color:var(--purple);padding-top:2px;}}
  .cl-text strong{{font-family:'Montserrat',sans-serif;font-size:12px;font-weight:800;color:var(--purple);display:block;margin-bottom:4px;}}
  .cl-text span{{font-size:12px;color:var(--muted);line-height:1.55;display:block;}}

  .phase-cards{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:8px;}}
  .phase-card{{background:var(--surface);border:1px solid var(--rule);border-radius:12px;overflow:hidden;}}
  .phase-card .ph-head{{padding:16px 20px;}}
  .phase-card.ph1 .ph-head{{background:var(--green-bg);border-bottom:1px solid var(--green-border);}}
  .phase-card.ph2 .ph-head{{background:var(--blue-bg);border-bottom:1px solid var(--blue-border);}}
  .phase-card.ph3 .ph-head{{background:var(--purple-bg);border-bottom:1px solid var(--purple-border);}}
  .phase-card .ph-label{{font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px;}}
  .phase-card.ph1 .ph-label{{color:var(--green-dark);}}.phase-card.ph2 .ph-label{{color:var(--blue);}}.phase-card.ph3 .ph-label{{color:var(--purple);}}
  .phase-card h3{{font-size:14px;color:var(--purple);}}
  .phase-card .ph-body{{padding:16px 20px;}}
  .ph-url-list{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}}
  .ph-url-list li{{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);padding:5px 8px;background:var(--alt);border-radius:5px;word-break:break-all;}}
  .ph-url-list li.built{{color:var(--green-dark);background:var(--green-bg);}}
  .ph-url-list li.missing{{color:var(--red);background:var(--red-bg);}}
  .ph-url-list li.placeholder{{color:var(--dim);font-style:italic;}}

  .empty-state{{padding:28px 24px;background:var(--alt);border:1px dashed var(--rule);border-radius:10px;color:var(--dim);font-size:13px;font-family:'Montserrat',sans-serif;font-weight:700;letter-spacing:0.04em;text-align:center;margin-bottom:20px;}}
  pre{{margin:0;white-space:pre-wrap;word-break:break-all;}}

  .footer{{padding:40px 0 60px;border-top:2px solid var(--purple);text-align:center;margin-top:60px;}}
  .footer strong{{color:var(--purple);font-family:'Montserrat',sans-serif;font-size:12px;display:block;margin-bottom:4px;}}
  .footer span{{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);}}

  @media(max-width:800px){{
    .score-grid,.phase-cards{{grid-template-columns:1fr;}}
    .wrap,.topnav-inner{{padding-left:20px;padding-right:20px;}}
    .cover{{padding:48px 20px 44px;}}
  }}
</style>
</head>
<body>

<nav class="topnav">
  <div class="topnav-inner">
    <div class="topnav-brand">{CLIENT_NAME} <span>·</span> Launch Readiness</div>
    <div class="topnav-links">
      <a href="#checklist">Pre-Flight Checklist</a>
      <a href="#must-live">Must-Live Pages</a>
      <a href="#redirects">Redirect Map</a>
      <a href="#phases">Launch Phases</a>
    </div>
  </div>
</nav>

<div class="cover">
  <div class="cover-inner">
    <div class="cover-eyebrow">Alloy Growth Partners · Site Launch Readiness · {TODAY}</div>
    <h1>{CLIENT_DOMAIN} <em>launch readiness</em></h1>
    <p class="cover-sub">Generated {TODAY}. Work through the pre-flight checklist before pointing the domain.{f" Crawl data loaded: {total_old_pages} old pages · {len(must_live_pages)} must-live identified · {ahrefs_pages_with_links} with external backlinks." if has_data else " Re-run with --sf-export and/or --ahrefs-export to auto-populate the redirect map."}</p>
    <div class="score-grid">
      <div class="score-card">
        <div class="sv {'red' if open_crit > 0 else 'green'}">{open_crit}</div>
        <div class="sl">Critical Open</div>
      </div>
      <div class="score-card">
        <div class="sv {'amber' if open_high > 0 else 'green'}">{open_high}</div>
        <div class="sl">High Open</div>
      </div>
      <div class="score-card">
        <div class="sv {'green' if resolved == total else 'amber'}">{resolved}/{total}</div>
        <div class="sl">Checklist Done</div>
      </div>
      <div class="score-card">
        <div class="sv {'green' if has_data else 'white'}">{len(must_live_pages) if has_data else '—'}</div>
        <div class="sl">Must-Live Pages</div>
      </div>
      <div class="score-card">
        <div class="sv {'green' if has_data else 'white'}">{total_old_pages if has_data else '—'}</div>
        <div class="sl">Old Pages Found</div>
      </div>
    </div>
  </div>
</div>

{render_data_banner()}

<div class="wrap">

<!-- PRE-LAUNCH CHECKLIST ─────────────────────────────────────────────────── -->
<section class="section" id="checklist">
  <div class="eyebrow {'red' if open_crit > 0 else ('amber' if open_high > 0 else 'green')}">Pre-Flight · {resolved} of {total} Complete</div>
  <h2>Pre-launch technical checklist</h2>
  <p class="section-intro">
    Run through this before pointing the domain.
    <strong>Critical</strong> items are hard blockers — the site must not go live until resolved.
    <strong>High</strong> items must be done on launch day.
    <strong>Medium</strong> items should be resolved within the first week.
  </p>
  <div class="checklist">
{render_checklist()}
  </div>
</section>

<!-- MUST-LIVE PAGES ──────────────────────────────────────────────────────── -->
<section class="section" id="must-live">
  <div class="eyebrow red">Day 1 Non-Negotiables · {len(must_live_pages) if has_data else '—'} Pages</div>
  <h2>Pages that must be live at launch</h2>
  <p class="section-intro">
    {"Pages from the old site with meaningful SEO signal — external backlinks, internal inlinks, or organic traffic. Every page here needs to either exist at its new URL or have a verified 301 in place before the domain goes live. Fill in the <strong>New URL / Action</strong> column as you build." if has_data else
     "Every page from the old site with backlinks, internal inlinks, or traffic. Fill this in from the old site crawl. Run the script with --sf-export and --ahrefs-export to auto-populate."}
  </p>
  {render_must_live_table()}
  <div class="alert info">
    <div class="alert-icon">ℹ️</div>
    <div class="alert-body">
      <strong>Priority guide</strong>
      <p>
        <span class="badge must">MUST LIVE</span> 5+ external backlinks or 50+ internal inlinks or 200+ monthly traffic — do not launch without a 301 or live page. &nbsp;
        <span class="badge p1">HIGH</span> 1–4 external backlinks or 15–49 inlinks — must have a redirect. &nbsp;
        <span class="badge p2">STANDARD</span> Under threshold — redirects still needed but lower urgency.
      </p>
    </div>
  </div>
</section>

<!-- REDIRECT MAP ─────────────────────────────────────────────────────────── -->
<section class="section" id="redirects">
  <div class="eyebrow amber">301 Redirect Map · {total_old_pages if has_data else '—'} Old Pages</div>
  <h2>Every redirect that needs to be in vercel.json</h2>
  <p class="section-intro">
    Implement all redirects in one pass. Test each one before launch with:
    <code>curl -I https://stg-{SLUG}.alloygp.co/old-path</code>.
    Every redirect must return 301. No chains (A → B → C — collapse to A → C direct).
    {"Rows highlighted red have external backlinks — these are the ones that cost you link equity if they 404." if has_data else ""}
  </p>
  {render_redirect_inventory()}
</section>

<!-- LAUNCH PHASES ────────────────────────────────────────────────────────── -->
<section class="section" id="phases">
  <div class="eyebrow blue">Build Phases</div>
  <h2>What goes live when</h2>
  <p class="section-intro">
    Phase 1 is what must exist on launch day — traffic protection and core architecture.
    Phases 2 and 3 are post-launch expansion. Fill these in as the build progresses.
  </p>
  <div class="phase-cards">
    <div class="phase-card ph1">
      <div class="ph-head">
        <div class="ph-label">Phase 1 · Day 1 — Must Ship</div>
        <h3>Core architecture + traffic protection</h3>
      </div>
      <div class="ph-body">
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Pages that must be live before the domain flips. Add URLs as they are confirmed 200 on staging.</p>
        <ul class="ph-url-list">
          <li class="placeholder">⬜ / (homepage)</li>
          <li class="placeholder">⬜ /request-a-proposal/ (primary CTA)</li>
          <li class="placeholder">⬜ Add primary service pages here</li>
          <li class="placeholder">⬜ Add must-live redirect destinations here</li>
        </ul>
      </div>
    </div>
    <div class="phase-card ph2">
      <div class="ph-head">
        <div class="ph-label">Phase 2 · Weeks 2–6</div>
        <h3>Geo pages + blog content</h3>
      </div>
      <div class="ph-body">
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Build out geo/location pages and priority blog content once Phase 1 is indexed.</p>
        <ul class="ph-url-list">
          <li class="placeholder">⬜ Add Phase 2 pages here</li>
        </ul>
      </div>
    </div>
    <div class="phase-card ph3">
      <div class="ph-head">
        <div class="ph-label">Phase 3 · Month 2+</div>
        <h3>Authority deepening</h3>
      </div>
      <div class="ph-body">
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Remaining geo pages, case studies, additional blog spokes.</p>
        <ul class="ph-url-list">
          <li class="placeholder">⬜ Add Phase 3 pages here</li>
        </ul>
      </div>
    </div>
  </div>
</section>

</div><!-- /wrap -->

<div class="footer">
  <div class="wrap">
    <strong>{CLIENT_NAME} — Site Launch Readiness · Alloy Growth Partners</strong>
    <span>Generated {TODAY} · {total} checklist items · {resolved} resolved · {open_crit} critical open · {open_high} high open{f" · {total_old_pages} old pages · {len(must_live_pages)} must-live" if has_data else ""} · Prepared by {OWNER}</span>
  </div>
</div>

</body>
</html>"""

with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(HTML)

print(f"  ✓ _build/{SLUG}_launch_readiness.html")
if has_data:
    print(f"    → {total_old_pages} old pages loaded · {len(must_live_pages)} must-live · {ahrefs_pages_with_links} with external backlinks")
