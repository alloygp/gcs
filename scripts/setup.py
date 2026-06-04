"""
AGP Client Site Setup Script
=============================
Run once after cloning the template repo for a new client.

Usage:
  python scripts/setup.py "Client Name" "clientdomain.com" ["Owner Name"]

Example:
  python scripts/setup.py "Tidewater CAM" "tidewatercam.com" "Skyler"

What it does:
  1. Generates the SEO tracker → _build/{slug}_seo_tracker.xlsx
  2. Updates astro.config.mjs with the live domain
  3. Pre-fills src/config/site.ts
  4. Pre-fills src/lib/email.config.ts
  5. Updates package.json name
  6. Prints a checklist of remaining manual steps
"""

import sys, os, re, subprocess, textwrap

# ── Args ──────────────────────────────────────────────────────────────────────
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)

CLIENT_NAME   = sys.argv[1].strip()
CLIENT_DOMAIN = re.sub(r"^https?://", "", sys.argv[2].strip()).rstrip("/")
OWNER         = sys.argv[3].strip() if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else "Skyler"
BASE_URL      = f"https://{CLIENT_DOMAIN}"
SLUG          = re.sub(r"[^a-z0-9]+", "_", CLIENT_NAME.lower()).strip("_")
PACKAGE_NAME  = re.sub(r"[^a-z0-9-]+", "-", CLIENT_NAME.lower()).strip("-")

# Optional export flags (forwarded from kickoff.py or passed directly)
sf_export     = None
ahrefs_export = None
for i, arg in enumerate(sys.argv):
    if arg == "--sf-export" and i + 1 < len(sys.argv):
        sf_export = sys.argv[i + 1]
    elif arg == "--ahrefs-export" and i + 1 < len(sys.argv):
        ahrefs_export = sys.argv[i + 1]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(path):
    with open(path, "r") as f:
        return f.read()

def write(path, content):
    with open(path, "w") as f:
        f.write(content)
    print(f"  ✓ {os.path.relpath(path, ROOT)}")

def replace_in_file(path, replacements):
    content = read(path)
    for old, new in replacements:
        content = content.replace(old, new)
    write(path, content)

print(f"\n{'='*60}")
print(f"  AGP Setup → {CLIENT_NAME} ({CLIENT_DOMAIN})")
print(f"{'='*60}\n")

# ── Step 1: SEO Tracker ───────────────────────────────────────────────────────
print("① Generating SEO tracker...")
tracker_script = os.path.join(ROOT, "scripts", "build_seo_tracker.py")
result = subprocess.run(
    [sys.executable, tracker_script, CLIENT_NAME, CLIENT_DOMAIN, OWNER],
    capture_output=True, text=True
)
if result.returncode == 0:
    print(f"  ✓ _build/{SLUG}_seo_tracker.xlsx")
else:
    print(f"  ✗ Tracker build failed:\n{result.stderr}")

# ── Step 1b: Launch Readiness Checker ─────────────────────────────────────────
print("\n① Generating launch readiness checker...")
checker_script = os.path.join(ROOT, "scripts", "build_launch_checker.py")
checker_cmd = [sys.executable, checker_script, CLIENT_NAME, CLIENT_DOMAIN, OWNER]
if sf_export:
    checker_cmd += ["--sf-export", sf_export]
if ahrefs_export:
    checker_cmd += ["--ahrefs-export", ahrefs_export]
result = subprocess.run(checker_cmd, capture_output=True, text=True)
if result.returncode == 0:
    print(f"  ✓ _build/{SLUG}_launch_readiness.html")
    if result.stdout.strip():
        print(result.stdout.strip())
else:
    print(f"  ✗ Launch checker build failed:\n{result.stderr}")

# ── Step 2: astro.config.mjs ──────────────────────────────────────────────────
print("\n② Updating astro.config.mjs...")
replace_in_file(
    os.path.join(ROOT, "astro.config.mjs"),
    [("https://clientsite.com", BASE_URL)]
)

# ── Step 3: src/config/site.ts ────────────────────────────────────────────────
print("\n③ Pre-filling src/config/site.ts...")
site_ts = os.path.join(ROOT, "src", "config", "site.ts")
replace_in_file(site_ts, [
    ("https://clientsite.com",              BASE_URL),
    ("Client Name",                         CLIENT_NAME),
    ("@clienthandle",                       f"@{SLUG}"),
    ("Client Name — Short tagline here",    CLIENT_NAME),
    ("contact@clientsite.com",              f"contact@{CLIENT_DOMAIN}"),
    ("https://clientsite.com/assets/logo.svg", f"{BASE_URL}/assets/logo.svg"),
])

# ── Step 4: src/lib/email.config.ts ──────────────────────────────────────────
print("\n④ Pre-filling src/lib/email.config.ts...")
email_ts = os.path.join(ROOT, "src", "lib", "email.config.ts")
replace_in_file(email_ts, [
    ("Client Name",                          CLIENT_NAME),
    ("https://clientsite.com",               BASE_URL),
    ("notifications@clientsite.com",         f"notifications@{CLIENT_DOMAIN}"),
    ("hello@clientsite.com",                 f"hello@{CLIENT_DOMAIN}"),
    ("owner@clientsite.com",                 f"owner@{CLIENT_DOMAIN}"),
    ("The Team",                             OWNER),
])

# ── Step 5: package.json ──────────────────────────────────────────────────────
print("\n⑤ Updating package.json name...")
pkg = os.path.join(ROOT, "package.json")
replace_in_file(pkg, [
    ('"agp-client-starter"', f'"{PACKAGE_NAME}-site"'),
    ("AGP Astro starter — rename to client project name before pushing to GitHub",
     f"AGP client site — {CLIENT_NAME}"),
])

# ── Checklist ─────────────────────────────────────────────────────────────────
print(f"""
{'='*60}
  ✅ Setup complete for {CLIENT_NAME}
{'='*60}

NEXT STEPS — manual checklist:

  [ ] Add real values to src/config/site.ts:
        - twitterHandle
        - defaultDescription
        - telephone, addressLocality, addressRegion

  [ ] Add real values to src/lib/email.config.ts:
        - notify email address(es)
        - email copy (confirmBody text)

  [ ] Set up DNS for {CLIENT_DOMAIN} in Resend
        https://resend.com/domains

  [ ] Add env vars in Vercel:
        RESEND_API_KEY
        MAILCHIMP_API_KEY
        MAILCHIMP_SERVER_PREFIX
        MAILCHIMP_AUDIENCE_ID
        INTERNAL_NOTIFY_EMAIL
        GA_MEASUREMENT_ID (optional)

  [ ] Copy .env.example → .env and fill in local dev values

  [ ] Add client logo → public/assets/logo.svg
  [ ] Add OG image → public/assets/og.png (1200×630px)
  [ ] Add favicon → public/assets/favicon.png

  [ ] Git: git init && git remote add origin <repo-url> && git push

  SEO tracker:        _build/{SLUG}_seo_tracker.xlsx
  Launch readiness:   _build/{SLUG}_launch_readiness.html
  Docs: ASTRO-SEO-FOUNDATION.md, SEO-CHECKLIST.md
""")
