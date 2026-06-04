#!/usr/bin/env python3
"""
AGP Client Kickoff Wizard
==========================
Run once after cloning the template repo for a new client.

Two modes:

  Interactive (terminal):
    python scripts/kickoff.py

  Non-interactive (Claude / CI):
    python scripts/kickoff.py \\
      --name "Tidewater CAM" --domain "tidewatercam.com" \\
      --owner "Skyler" --twitter "@tidewatercam" \\
      --phone "(757) 499-3200" --city "Virginia Beach" --state "VA" \\
      --description "HOA management..." --tagline "HOA management made simple" \\
      --notify "team@alloygp.co" --ga "G-XXXXXXXXXX" --yes

What it does:
  1. Generates the SEO tracker (_build/{slug}_seo_tracker.xlsx)
  2. Generates the launch readiness checker (_build/{slug}_launch_readiness.html)
     — Screaming Frog CSV auto-detected from exports/sf_*.csv
     — Ahrefs data auto-fetched if AHREFS_API_KEY env var is set
  3. Copies master brief from _client/master_brief.* → _build/
  4. Updates astro.config.mjs, src/config/site.ts, src/lib/email.config.ts, package.json
  5. Writes .env with all integration keys (or placeholders)
"""

import sys, os, re, subprocess, argparse, shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent

# ── Helpers ───────────────────────────────────────────────────────────────────

def ask(prompt, default="", required=False):
    suffix = f" [{default}]" if default else (" (required)" if required else " (optional, Enter to skip)")
    while True:
        val = input(f"  {prompt}{suffix}: ").strip()
        result = val or default
        if result or not required:
            return result
        print("    ↳ This field is required.")

def section(title):
    print(f"\n{'─'*52}")
    print(f"  {title}")
    print('─'*52)

def ok(msg):   print(f"  ✓ {msg}")
def note(msg): print(f"  → {msg}")
def skip(msg): print(f"  · {msg}")

def replace_in_file(path, replacements):
    with open(path, "r") as f:
        content = f.read()
    for old, new in replacements:
        if old and new != old:
            content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)

def find_export(prefix):
    """First CSV in exports/ whose name starts with prefix."""
    d = ROOT / "exports"
    if not d.exists():
        return None
    for f in sorted(d.iterdir()):
        if f.suffix.lower() == ".csv" and f.stem.lower().startswith(prefix):
            return f
    return None

def find_brief():
    """First master_brief.* in _client/."""
    d = ROOT / "_client"
    if not d.exists():
        return None
    for f in sorted(d.iterdir()):
        if f.stem.lower().startswith("master_brief") and f.suffix.lower() in (".html", ".pdf", ".docx"):
            return f
    return None

# ══════════════════════════════════════════════════════════════════════════════
# ARGS — non-interactive mode when --name + --domain are supplied
# ══════════════════════════════════════════════════════════════════════════════

parser = argparse.ArgumentParser(description="AGP client kickoff", add_help=True)
parser.add_argument("--name",        help="Client name, e.g. 'Tidewater CAM'")
parser.add_argument("--domain",      help="Domain, e.g. tidewatercam.com")
parser.add_argument("--owner",       help="Your name", default="Skyler")
parser.add_argument("--twitter",     help="Twitter/X handle, e.g. @tidewatercam", default="")
parser.add_argument("--phone",       help="Phone number, e.g. (757) 499-3200", default="")
parser.add_argument("--city",        help="City, e.g. Virginia Beach", default="")
parser.add_argument("--state",       help="State abbreviation, e.g. VA", default="")
parser.add_argument("--description", help="Default meta description", default="")
parser.add_argument("--tagline",     help="Short tagline, e.g. 'HOA management made simple'", default="")
parser.add_argument("--notify",      help="Internal notify email", default="")
parser.add_argument("--ga",          help="GA4 Measurement ID, e.g. G-XXXXXXXXXX", default="")
parser.add_argument("--resend-key",  help="Resend API key", default="")
parser.add_argument("--slack-alert-url", help="Slack Incoming Webhook URL for form send-failure alerts (FORM_ALERT_SLACK_URL)", default="")
parser.add_argument("--mailchimp-key",      help="Mailchimp API key", default="")
parser.add_argument("--mailchimp-server",   help="Mailchimp server prefix, e.g. us21", default="")
parser.add_argument("--mailchimp-audience", help="Mailchimp Audience ID", default="")
parser.add_argument("--sf-export",  help="Path to Screaming Frog CSV (overrides exports/ auto-detect)", default="")
parser.add_argument("--brief",      help="Path to master brief file (overrides _client/ auto-detect)", default="")
parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")

args = parser.parse_args()
NON_INTERACTIVE = bool(args.name and args.domain)

# ══════════════════════════════════════════════════════════════════════════════
# COLLECT INFO
# ══════════════════════════════════════════════════════════════════════════════

if NON_INTERACTIVE:
    CLIENT_NAME   = args.name.strip()
    CLIENT_DOMAIN = re.sub(r"^https?://", "", args.domain.strip()).rstrip("/")
    OWNER         = args.owner or "Skyler"
    TWITTER       = args.twitter
    PHONE         = args.phone
    CITY          = args.city
    STATE         = args.state
    DESCRIPTION   = args.description
    TAGLINE       = args.tagline
    NOTIFY_EMAIL  = args.notify or f"contact@{CLIENT_DOMAIN}"
    GA_ID         = args.ga
    RESEND_KEY    = args.resend_key
    SLACK_ALERT_URL    = args.slack_alert_url
    MAILCHIMP_KEY      = args.mailchimp_key
    MAILCHIMP_SERVER   = args.mailchimp_server
    MAILCHIMP_AUDIENCE = args.mailchimp_audience

else:
    print("\n" + "="*52)
    print("  AGP Client Kickoff Wizard")
    print("="*52)
    print("  Answer every prompt, or press Enter to skip.")
    print("  Skipped fields stay as TODOs — fill them in later.")

    section("① Client basics")
    CLIENT_NAME   = ask("Client name", required=True)
    CLIENT_DOMAIN = re.sub(r"^https?://", "", ask("Domain (no https://)", required=True)).rstrip("/")
    OWNER         = ask("Your name", default="Skyler")

    section("② SEO & contact details")
    TWITTER     = ask("Twitter/X handle (e.g. @handle)")
    PHONE       = ask("Phone number (e.g. (757) 555-1234)")
    CITY        = ask("City (e.g. Virginia Beach)")
    STATE       = ask("State abbreviation (e.g. VA)")
    DESCRIPTION = ask("Default meta description (130–160 chars)")
    TAGLINE     = ask("Short tagline (10 words max, e.g. 'HOA management made simple')")

    section("③ Email routing")
    NOTIFY_EMAIL = ask("Internal notify email — where leads land", default=f"contact@{CLIENT_DOMAIN}")

    section("④ Integrations (Enter to use placeholder — fill in Vercel later)")
    GA_ID              = ask("GA4 Measurement ID (e.g. G-XXXXXXXXXX)")
    RESEND_KEY         = ask("Resend API key (re_...)")
    SLACK_ALERT_URL    = ask("Slack webhook URL for form-failure alerts (same as resend-slack-alerts)")
    MAILCHIMP_KEY      = ask("Mailchimp API key")
    MAILCHIMP_SERVER   = ask("Mailchimp server prefix (e.g. us21)")
    MAILCHIMP_AUDIENCE = ask("Mailchimp Audience ID")

# ── Derived values ────────────────────────────────────────────────────────────
BASE_URL     = f"https://{CLIENT_DOMAIN}"
SLUG         = re.sub(r"[^a-z0-9]+", "_", CLIENT_NAME.lower()).strip("_")
PACKAGE_NAME = re.sub(r"[^a-z0-9-]+", "-", CLIENT_NAME.lower()).strip("-")

# ── Auto-detect / resolve export files ───────────────────────────────────────
# Priority: explicit flag → auto-detect from folder → ask (interactive only)

# Screaming Frog
if args.sf_export:
    SF_EXPORT = Path(args.sf_export) if Path(args.sf_export).exists() else None
    if not SF_EXPORT:
        print(f"  ⚠ --sf-export path not found: {args.sf_export}")
else:
    SF_EXPORT = find_export("sf_")

if not SF_EXPORT and not NON_INTERACTIVE:
    print("\n  No Screaming Frog export found in exports/")
    raw = ask("  Path to SF Internal CSV (Enter to skip and leave redirect map blank)")
    if raw:
        p = Path(raw.strip())
        SF_EXPORT = p if p.exists() else None
        if not SF_EXPORT:
            print(f"    ↳ File not found at {raw} — skipping")

# Master brief
if args.brief:
    MASTER_BRIEF = Path(args.brief) if Path(args.brief).exists() else None
    if not MASTER_BRIEF:
        print(f"  ⚠ --brief path not found: {args.brief}")
else:
    MASTER_BRIEF = find_brief()

if not MASTER_BRIEF and not NON_INTERACTIVE:
    print("\n  No master brief found in _client/")
    raw = ask("  Path to master brief HTML/PDF (Enter to skip)")
    if raw:
        p = Path(raw.strip())
        MASTER_BRIEF = p if p.exists() else None
        if not MASTER_BRIEF:
            print(f"    ↳ File not found at {raw} — skipping")

AHREFS_EXPORT = find_export("ahrefs_")
AHREFS_KEY    = os.environ.get("AHREFS_API_KEY", "")

print()
note(f"Screaming Frog: {'  ' + str(SF_EXPORT) if SF_EXPORT else 'not found — redirect map will be blank'}")
if AHREFS_KEY:
    note(f"Ahrefs:          API key set — will auto-fetch")
elif AHREFS_EXPORT:
    note(f"Ahrefs:          CSV found — exports/{AHREFS_EXPORT.name}")
else:
    note(f"Ahrefs:          none — set AHREFS_API_KEY in ~/.zshrc to auto-fetch")
note(f"Master brief:    {str(MASTER_BRIEF) if MASTER_BRIEF else 'not found — skipping'}")

# ── Confirm ───────────────────────────────────────────────────────────────────
if not (NON_INTERACTIVE and args.yes):
    print(f"""
{'='*52}
  Ready to run kickoff for:

    Client:  {CLIENT_NAME}
    Domain:  {CLIENT_DOMAIN}
    Owner:   {OWNER}
""")
    if TWITTER:      print(f"    Twitter:  {TWITTER}")
    if PHONE:        print(f"    Phone:    {PHONE}")
    if CITY:         print(f"    City:     {CITY}")
    if STATE:        print(f"    State:    {STATE}")
    if DESCRIPTION:  print(f"    Desc:     {DESCRIPTION[:60]}{'...' if len(DESCRIPTION) > 60 else ''}")
    if SF_EXPORT:    print(f"    SF crawl: exports/{SF_EXPORT.name}")
    if MASTER_BRIEF: print(f"    Brief:    _client/{MASTER_BRIEF.name}")
    print()
    confirm = input("  Go? [Y/n]: ").strip().lower()
    if confirm and confirm not in ("y", "yes"):
        print("  Aborted.")
        sys.exit(0)

print()

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: RUN SETUP.PY
# ══════════════════════════════════════════════════════════════════════════════

section("Running setup.py (tracker + launch checker + config files)")

setup_script = ROOT / "scripts" / "setup.py"
setup_cmd = [sys.executable, str(setup_script), CLIENT_NAME, CLIENT_DOMAIN, OWNER]
if SF_EXPORT and SF_EXPORT.exists():
    setup_cmd += ["--sf-export", str(SF_EXPORT)]
if AHREFS_EXPORT and not AHREFS_KEY:
    setup_cmd += ["--ahrefs-export", str(AHREFS_EXPORT)]

result = subprocess.run(
    setup_cmd,
    env={**os.environ, "AHREFS_API_KEY": AHREFS_KEY},
    capture_output=False,
    text=True,
)
if result.returncode != 0:
    print(f"\n  ✗ setup.py exited with code {result.returncode}.")
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: FILL IN REMAINING site.ts VALUES
# ══════════════════════════════════════════════════════════════════════════════

section("Filling in remaining site.ts values")
site_ts = ROOT / "src" / "config" / "site.ts"
replacements = []

if TWITTER:
    handle = TWITTER if TWITTER.startswith("@") else f"@{TWITTER}"
    replacements.append((f"'@{SLUG}'", f"'{handle}'"))
    ok(f"twitterHandle → {handle}")
else:
    skip("twitterHandle — skipped")

if TAGLINE:
    replacements.append((f"'{CLIENT_NAME}'", f"'{CLIENT_NAME} — {TAGLINE}'"))
    ok(f"defaultTitle → {CLIENT_NAME} — {TAGLINE}")
else:
    skip("defaultTitle tagline — skipped")

if DESCRIPTION:
    replacements.append((
        "'One sentence describing what the business does and who it serves.'",
        f"'{DESCRIPTION}'"
    ))
    ok(f"defaultDescription → set")
else:
    skip("defaultDescription — skipped")

if PHONE:
    digits = re.sub(r"[^0-9]", "", PHONE)
    if len(digits) == 10:
        formatted = f"+1-{digits[0:3]}-{digits[3:6]}-{digits[6:]}"
    elif len(digits) == 11 and digits[0] == "1":
        formatted = f"+1-{digits[1:4]}-{digits[4:7]}-{digits[7:]}"
    else:
        formatted = PHONE
    replacements.append(("'+1-XXX-XXX-XXXX'", f"'{formatted}'"))
    ok(f"telephone → {formatted}")
else:
    skip("telephone — skipped")

if CITY:
    replacements.append(("'City'", f"'{CITY}'"))
    ok(f"addressLocality → {CITY}")
else:
    skip("addressLocality — skipped")

if STATE:
    replacements.append(("'TX'", f"'{STATE.upper()}'"))
    ok(f"addressRegion → {STATE.upper()}")
else:
    skip("addressRegion — skipped")

if replacements:
    replace_in_file(site_ts, replacements)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: FILL IN REMAINING email.config.ts VALUES
# ══════════════════════════════════════════════════════════════════════════════

section("Filling in remaining email.config.ts values")
email_ts = ROOT / "src" / "lib" / "email.config.ts"
email_replacements = []

if NOTIFY_EMAIL and NOTIFY_EMAIL != f"owner@{CLIENT_DOMAIN}":
    email_replacements.append((f"'owner@{CLIENT_DOMAIN}'", f"'{NOTIFY_EMAIL}'"))
    ok(f"notify → {NOTIFY_EMAIL}")
else:
    note(f"notify email → owner@{CLIENT_DOMAIN} (update if different)")

email_replacements.append(("<p>— Skyler</p>", f"<p>— {OWNER}</p>"))
ok(f"email sign-off → {OWNER}")

if email_replacements:
    replace_in_file(email_ts, email_replacements)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: COPY MASTER BRIEF TO _build/
# ══════════════════════════════════════════════════════════════════════════════

if MASTER_BRIEF:
    section("Copying master brief to _build/")
    build_dir = ROOT / "_build"
    build_dir.mkdir(exist_ok=True)
    dest = build_dir / f"{SLUG}_master_brief{MASTER_BRIEF.suffix}"
    shutil.copy2(MASTER_BRIEF, dest)
    ok(f"_build/{dest.name}")

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: WRITE .env
# ══════════════════════════════════════════════════════════════════════════════

section("Writing .env")
env_path = ROOT / ".env"

if env_path.exists():
    env_path.rename(ROOT / ".env.backup")
    note("Existing .env backed up to .env.backup")

env_lines = [
    f"# {CLIENT_NAME} — {CLIENT_DOMAIN}",
    "# Generated by kickoff.py",
    "",
    "# ── Resend ──────────────────────────────────────────────────────",
    f"RESEND_API_KEY={RESEND_KEY or 're_xxxxxxxxxxxxxxxxxxxx'}",
    "",
    "# ── Form send-failure alerts (Slack) ────────────────────────────",
    "# Same Slack Incoming Webhook URL as the resend-slack-alerts project.",
    "# Leave blank to disable (forms keep working; helper just no-ops).",
    f"FORM_ALERT_SLACK_URL={SLACK_ALERT_URL or ''}",
    "",
    "# ── Mailchimp (delete these 3 lines if not using Mailchimp) ─────",
    f"MAILCHIMP_API_KEY={MAILCHIMP_KEY or 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21'}",
    f"MAILCHIMP_SERVER_PREFIX={MAILCHIMP_SERVER or 'us21'}",
    f"MAILCHIMP_AUDIENCE_ID={MAILCHIMP_AUDIENCE or 'xxxxxxxxxxxx'}",
    "",
    "# ── Internal notifications ──────────────────────────────────────",
    f"INTERNAL_NOTIFY_EMAIL={NOTIFY_EMAIL}",
    "",
    "# ── Google Analytics (leave blank to skip) ──────────────────────",
    f"GA_MEASUREMENT_ID={GA_ID or 'G-XXXXXXXXXX'}",
    "",
    "# ── Production flag (set this in Vercel too) ────────────────────",
    "PUBLIC_ENV=development",
]
env_path.write_text("\n".join(env_lines) + "\n")
ok(".env written")

if not RESEND_KEY:
    note("RESEND_API_KEY is a placeholder — update .env and Vercel before launch")
if not MAILCHIMP_KEY:
    note("Mailchimp keys are placeholders — update if client uses Mailchimp")

# ══════════════════════════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════════════════════════

remaining = []
if not TWITTER:       remaining.append("src/config/site.ts — add twitterHandle")
if not DESCRIPTION:   remaining.append("src/config/site.ts — add defaultDescription")
if not PHONE:         remaining.append("src/config/site.ts — add telephone")
if not CITY:          remaining.append("src/config/site.ts — add addressLocality")
if not STATE:         remaining.append("src/config/site.ts — add addressRegion")
if not RESEND_KEY:    remaining.append(".env + Vercel — add RESEND_API_KEY")
if not SLACK_ALERT_URL: remaining.append(".env + Vercel — add FORM_ALERT_SLACK_URL (form-failure alerts)")
if not MAILCHIMP_KEY: remaining.append(".env + Vercel — add MAILCHIMP_API_KEY (if using)")
if not GA_ID:         remaining.append(".env + Vercel — add GA_MEASUREMENT_ID (optional)")

brief_line = f"\n  _build/{SLUG}_master_brief{MASTER_BRIEF.suffix}" if MASTER_BRIEF else ""

print(f"""
{'='*52}
  ✅  Kickoff complete — {CLIENT_NAME}
{'='*52}

  _build/{SLUG}_seo_tracker.xlsx
  _build/{SLUG}_launch_readiness.html{brief_line}

STILL NEEDS HUMAN HANDS:
""")

always_manual = [
    f"Add logo            → public/assets/logo.svg",
    f"Add OG image        → public/assets/og.png  (1200×630px)",
    f"Add favicon         → public/assets/favicon.png",
    f"Set up Resend DNS   → https://resend.com/domains (add {CLIENT_DOMAIN})",
    f"Add Vercel env vars → copy from .env (set PUBLIC_ENV=production on prod)",
    f"Git remote          → git init && git remote add origin <repo-url> && git push",
]

for item in (remaining + always_manual):
    print(f"  [ ] {item}")

print()
if not AHREFS_KEY and not AHREFS_EXPORT:
    print(f"  TIP: Add to ~/.zshrc → export AHREFS_API_KEY=your_key")
    print(f"       Then open a new terminal — Ahrefs fetches automatically on every kickoff.")
    print()
