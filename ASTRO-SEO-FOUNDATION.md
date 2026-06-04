# Astro SEO Foundation

The SEO infrastructure layer for Astro + Vercel sites. Drop these files into any
new project and you have canonical URLs, OG tags, Twitter cards, JSON-LD schema,
security headers, robots, and a sitemap — all wired up and ready before you write
a single page.

---

## New site setup — run this every time

Check off each step before writing your first page. None of these take more than
a few minutes and skipping them means the site goes live with broken schema,
wrong OG cards, or TODO.com in your robots file.

### Step 1 — Fill in site identity
- [ ] Open `src/config/site.ts`
- [ ] Replace every `TODO` value: name, url, twitterHandle, logo path, telephone, email, address fields
- [ ] Confirm `url` has no trailing slash and matches the production domain exactly

### Step 2 — Drop in assets
- [ ] Add `public/assets/favicon.png` (square, any size — 32px minimum)
- [ ] Add `public/assets/og.png` (1200×630px — this is the default social card for every page)

### Step 3 — Wire up BaseLayout
- [ ] Open `src/layouts/BaseLayout.astro`
- [ ] Add your Google Font URL (or remove the font block if self-hosting)
- [ ] Paste in the GA4 measurement ID (`G-XXXXXXXXXX`) in the analytics block
- [ ] Uncomment `<SiteHeader />` once it exists
- [ ] Uncomment `<SiteFooter />` once it exists
- [ ] Add any third-party scripts (chat, conversion tracking) with `is:inline` — see notes below

### Step 4 — Update domain references
- [ ] `public/robots.txt` — replace `TODO.com` with real domain
- [ ] `public/sitemap.xml` — replace `TODO.com`, add homepage `<url>` entry

### Step 5 — Verify before first deploy
- [ ] Run `npm run build` locally — confirm zero errors
- [ ] Open the homepage in browser, view source, confirm `<title>`, `<meta name="description">`, and `<link rel="canonical">` all look correct
- [ ] Check the OG image renders at `https://opengraph.xyz` or paste the URL into the Twitter Card Validator
- [ ] Paste the homepage URL into [Google Rich Results Test](https://search.google.com/test/rich-results) — Organization schema should pass
- [ ] Submit `sitemap.xml` in Google Search Console once the domain is live

---

## File inventory

```
src/
├── config/
│   └── site.ts          ← FILL THIS IN FIRST. Single source of truth.
├── lib/
│   └── schema.ts        ← Schema builder functions. Never write JSON-LD by hand.
└── layouts/
    └── BaseLayout.astro ← Root layout. Every page wraps in this.

public/
├── robots.txt           ← Allow all + sitemap pointer.
├── sitemap.xml          ← Manual sitemap. Add pages as you build.
└── assets/
    ├── favicon.png      ← TODO: add
    └── og.png           ← TODO: add (1200×630px)

vercel.json              ← cleanUrls, no trailing slash, security headers.
```

---

## BaseLayout props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | string | required | Keep ≤ 60 chars |
| `description` | string | required | Keep 120–160 chars |
| `pageId` | string | null | Active nav item key |
| `headerTheme` | `'light'` \| `'dark'` | `'light'` | |
| `ogType` | `'website'` \| `'article'` | `'website'` | Use `'article'` for blog/resource pages |
| `ogImage` | string | `SITE.defaultOgImage` | Absolute path from `/public` |
| `robots` | string | — | e.g. `"noindex,nofollow"` for staging/legal |
| `pageSchema` | object \| object[] | — | JSON-LD from `~/lib/schema.ts` |
| `hideHeader` | boolean | false | Omits SiteHeader (course/quiz pages) |

---

## Per-page schema patterns

### Service page
```astro
---
import BaseLayout from '~/layouts/BaseLayout.astro';
import { serviceSchema, breadcrumbSchema, faqSchema } from '~/lib/schema';
import { SITE } from '~/config/site';
import MyServicePage, { pageFAQs } from '~/components/pages/MyServicePage';

const pageUrl = `${SITE.url}/services/my-service`;

const schemas = [
  serviceSchema({
    name: 'My Service Name',
    description: 'One-sentence description.',
    url: pageUrl,
  }),
  breadcrumbSchema([
    { name: 'Home',     url: SITE.url + '/' },
    { name: 'Services', url: SITE.url + '/services' },
    { name: 'My Service', url: pageUrl },
  ]),
  faqSchema(pageFAQs),  // export the FAQ array from the component so schema stays in sync
];
---
<BaseLayout
  title="My Service | Company Name"
  description="120–160 char meta description."
  pageId="services"
  pageSchema={schemas}
>
  <MyServicePage client:load />
</BaseLayout>
```

### Blog / resource article
```astro
---
import { articleSchema, breadcrumbSchema, faqSchema } from '~/lib/schema';

const pageUrl = `${SITE.url}/resources/my-article`;

const schemas = [
  articleSchema({
    headline: 'Article Title',
    description: pageDesc,
    url: pageUrl,
    datePublished: '2026-05-13',
    dateModified:  '2026-05-13',
    about: ['Topic One', 'Topic Two'],
  }),
  breadcrumbSchema([
    { name: 'Home',      url: SITE.url + '/' },
    { name: 'Resources', url: SITE.url + '/resources' },
    { name: 'Article Title', url: pageUrl },
  ]),
  faqSchema(articleFAQs),
];
---
<BaseLayout ogType="article" pageSchema={schemas} ...>
```

### Contact / About page
```astro
---
import { localBusinessSchema, breadcrumbSchema } from '~/lib/schema';

const schemas = [
  localBusinessSchema({ description: pageDesc }),
  breadcrumbSchema([
    { name: 'Home',    url: SITE.url + '/' },
    { name: 'Contact', url: SITE.url + '/contact' },
  ]),
];
---
```

### Homepage — no extra schema needed
BaseLayout already renders the Organization schema on every page.
The homepage typically doesn't need additional JSON-LD unless you want a
SiteLinksSearchBox or specific offer markup.

---

## Sitemap priority guide

| Priority | Use for |
|---|---|
| 1.0 | Homepage only |
| 0.9 | Primary money / service pages |
| 0.85 | Secondary service / location pages |
| 0.8 | Resource articles, guides, blog posts |
| 0.7 | About, Contact, FAQ |
| 0.5 | Legal (privacy policy, terms) |

Always set `<lastmod>` to the date the content was last meaningfully changed.
Update it when you revise page copy — Google uses it as a crawl-priority signal.

---

## Retrofitting an existing repo

You don't rebuild — you drop in 4 files and make targeted edits. The existing
components, pages, and styles stay untouched.

**Estimated time: 20–30 minutes per repo.**

### Step 1 — Add the config and schema files
- [ ] Copy `src/config/site.ts` into the repo
- [ ] Fill in every `TODO` for this client
- [ ] Copy `src/lib/schema.ts` into the repo
- [ ] Confirm the `~/` path alias is configured in `tsconfig.json` (or update import paths to match the existing alias)

### Step 2 — Upgrade the root layout
Look at the existing root layout (usually `BaseLayout.astro` or `Layout.astro`).

**If `<head>` is basic (just title + description):** replace the whole file with the starter `BaseLayout.astro`, then re-add any site-specific styles/components that were there.

**If `<head>` is already complex:** merge in just the missing pieces:
- [ ] Add canonical: `<link rel="canonical" href={canonicalUrl} />`
- [ ] Add full OG block (og:title, og:description, og:url, og:type, og:image, og:image:width/height)
- [ ] Add Twitter card block
- [ ] Add `pageSchema` prop and JSON-LD injection block
- [ ] Add `robots` prop and conditional `<meta name="robots">` tag
- [ ] Add `ogImage` prop with fallback to `SITE.defaultOgImage`
- [ ] Confirm canonical URL uses `Astro.site` (set in `astro.config.mjs`) not a hardcoded string

### Step 3 — Update config files
- [ ] `vercel.json` — add the security headers block if it's missing. Keep any existing redirects.
- [ ] `public/robots.txt` — confirm sitemap pointer points to the correct domain
- [ ] `public/sitemap.xml` — if it doesn't exist, create it from the starter template and add all existing pages

### Step 4 — Add assets if missing
- [ ] `public/assets/og.png` (1200×630px) — if there's no default OG card, create one
- [ ] `public/assets/favicon.png` — confirm one exists

### Step 5 — Audit existing pages for schema
Work through pages in priority order. For each, open the `.astro` route file and add `pageSchema`.

**Priority order:**
1. Homepage — usually just needs the org schema (already in BaseLayout), confirm it's there
2. Primary service / money pages — add `serviceSchema` + `breadcrumbSchema` + `faqSchema` if the page has an FAQ section
3. About / Contact — add `localBusinessSchema` + `breadcrumbSchema`
4. Resource articles / blog posts — add `articleSchema` + `breadcrumbSchema` + `faqSchema`
5. Legal pages — add `robots="noindex,follow"` to BaseLayout call; no schema needed

For each page that has an FAQ section: export the FAQ array from the component file so the schema and the on-page text stay in sync automatically (see per-page schema patterns above).

### Step 6 — Verify
- [ ] `npm run build` — zero errors
- [ ] View source on homepage: confirm canonical, description, OG image are correct
- [ ] [Google Rich Results Test](https://search.google.com/test/rich-results) on homepage and one service page
- [ ] OG card preview at `https://opengraph.xyz`
- [ ] Submit sitemap in Google Search Console if not already done

---

## Notes on Astro script tags

Any `<script src="...">` pointing to an external URL must use `is:inline`
to prevent Astro from trying to bundle it:

```html
<!-- Correct -->
<script is:inline src="//third-party.com/tracker.js"></script>

<!-- Wrong — build will fail -->
<script src="//third-party.com/tracker.js"></script>
```

This applies to: analytics, conversion tracking, chat widgets, A/B test scripts.

---

## Notes on JSON-LD placement

Astro's `pageSchema` prop injects JSON-LD into `<head>` via `<script type="application/ld+json">`.
This is correct and preferred. Google parses JSON-LD from `<body>` too, but `<head>` is cleaner
and avoids any edge-case hydration issues with React components.

Keep FAQ answers in the schema **identical** to the on-page rendered text.
Google's Rich Results Test will flag mismatches and suppress the rich snippet.
The cleanest way to stay in sync is to export the FAQ array from the page component
and import it in the .astro route file (see service page example above).
