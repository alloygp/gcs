# SEO Audit & Setup Checklist
**Reusable across any Astro SSR site**

Run this top to bottom on any new site or as a quarterly audit pass. Each section has what to check and what good looks like.

---

## 1. Meta Tags — Every Page

Check in: the root layout file (e.g. `BaseLayout.astro`).

### Title tag
- Format: `Primary Keyword — Secondary Keyword | Brand Name`
- Length: **50–60 characters** (Google truncates at ~60)
- Must be unique per page — no duplicate titles across the site
- Must include the primary keyword for that page
- Homepage gets brand name first; all other pages get keywords first

**Common mistakes:**
- Titles like "BoardMatch™ — Close — Alloy" (27 chars, no keywords) → fix to include the service keyword
- Missing brand name on some pages but not others — pick a pattern and be consistent
- Titles over 70 chars — will be rewritten by Google

### Meta description
- Length: **140–155 characters** (Google truncates at ~155–160 on mobile)
- Must be unique per page
- Should include the primary keyword naturally
- Write it as a CTA — it directly affects click-through rate
- Not a ranking factor but heavily influences CTR which does affect rankings

**Common mistakes:**
- Descriptions over 160 chars (gets truncated mid-sentence, looks bad in SERPs)
- Generic descriptions that could apply to any page
- Not including the keyword

### Canonical URL
```html
<link rel="canonical" href="https://yourdomain.com/page-slug" />
```
- Must match the actual URL exactly (no trailing slash inconsistency)
- Domain should match `site` in `astro.config.mjs` exactly
- No `www` vs non-www mismatch (pick one, redirect the other)

---

## 2. Open Graph (Social Cards)

Check in: the root layout `<head>`. These control how links appear when shared on LinkedIn, Slack, iMessage, etc.

### Required tags
```html
<meta property="og:title" content="..." />           <!-- Same as <title> -->
<meta property="og:description" content="..." />     <!-- Same as meta description -->
<meta property="og:url" content="https://..." />     <!-- Canonical URL -->
<meta property="og:type" content="website" />        <!-- or "article" for blog posts -->
<meta property="og:site_name" content="Brand Name" />
<meta property="og:locale" content="en_US" />
<meta property="og:image" content="https://.../og-image.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Descriptive alt text for the image" />
```

### OG image requirements
- **Size: 1200×630px** — the universal safe size for all platforms
- Format: PNG preferred (JPG fine, avoid SVG — not supported)
- File size: keep under 300KB
- Include: brand name, tagline or page headline, brand colors
- The file must actually exist at the referenced path (verify with `ls public/assets/`)
- Use a single default OG image for all pages; override per-page only for articles/case studies

### Article pages override
For blog posts, articles, case studies:
```html
<meta property="og:type" content="article" />
```

---

## 3. Twitter / X Cards

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@yourhandle" />
<meta name="twitter:title" content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image" content="https://.../og-image.png" />
<meta name="twitter:image:alt" content="..." />
```

- `summary_large_image` is always correct for marketing sites
- `twitter:image` must be present — many sites have `og:image` but forget this one
- Image must be publicly accessible (not behind auth)

---

## 4. JSON-LD Structured Data (Schema.org)

Schema is how search engines and AI engines understand what your content *is*. It affects rich results in Google and citation probability in AI tools (ChatGPT, Perplexity, Gemini).

### Organization schema — every page
```json
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "Company Name",
  "url": "https://yourdomain.com",
  "logo": "https://yourdomain.com/assets/logo.svg",
  "description": "One-sentence description",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "City",
    "addressRegion": "TX",
    "addressCountry": "US"
  },
  "telephone": "+1-XXX-XXX-XXXX",
  "email": "contact@yourdomain.com",
  "areaServed": "United States",
  "priceRange": "$$$"
}
```

### FAQ schema — FAQ pages
Any page with accordion Q&A sections should have this. Google can show FAQ rich results.
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "The exact question text as it appears on the page",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The full answer text."
      }
    }
  ]
}
```
- Questions must match the visible text on the page exactly
- Keep answers in plain text (no HTML in the `text` field)

### Article schema — blog posts, resource hub articles
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Article title",
  "description": "Meta description",
  "url": "https://yourdomain.com/article-slug",
  "mainEntityOfPage": "https://yourdomain.com/article-slug",
  "author": {
    "@type": "Person",
    "name": "Author Name",
    "jobTitle": "Title",
    "worksFor": {
      "@type": "Organization",
      "name": "Company",
      "url": "https://yourdomain.com"
    }
  },
  "publisher": {
    "@type": "Organization",
    "name": "Company",
    "url": "https://yourdomain.com",
    "logo": {
      "@type": "ImageObject",
      "url": "https://yourdomain.com/assets/logo.svg"
    }
  },
  "image": "https://yourdomain.com/assets/og-image.png"
}
```

### Service schema — individual service pages (optional but high value)
```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Service Name",
  "description": "What the service does",
  "provider": {
    "@type": "Organization",
    "name": "Company Name",
    "url": "https://yourdomain.com"
  },
  "areaServed": "United States",
  "serviceType": "Marketing"
}
```

### How to implement per-page schema in Astro
Add an optional `pageSchema` prop to BaseLayout and inject it as a second `<script type="application/ld+json">` block:
```astro
---
// In BaseLayout.astro
interface Props {
  pageSchema?: Record<string, unknown> | Record<string, unknown>[];
}
const { pageSchema } = Astro.props;
---
{pageSchema && (
  <script type="application/ld+json" set:html={JSON.stringify(pageSchema)} />
)}
```
Then in any `.astro` route file:
```astro
---
const faqSchema = { '@context': '...', '@type': 'FAQPage', ... };
---
<BaseLayout pageSchema={faqSchema}>
```

### Validation
Always validate schema at: https://validator.schema.org
Or test rich results at: https://search.google.com/test/rich-results

---

## 5. Sitemap

### What to include
- Every publicly indexable page
- Do NOT include: 404, login, password-reset, admin, thank-you pages, paginated duplicates

### Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yourdomain.com/</loc>
    <priority>1.0</priority>
    <changefreq>weekly</changefreq>
  </url>
</urlset>
```

### Priority guidelines
| Priority | Use for |
|---|---|
| 1.0 | Homepage |
| 0.95 | Primary conversion page (contact, quote request) |
| 0.9 | Core service/product pages |
| 0.85 | Secondary service pages |
| 0.8 | Results, case studies, high-value articles |
| 0.75 | About, testimonials |
| 0.7 | Blog index, resource hub, tools |
| 0.65 | Courses, learning content |
| 0.3 | Legal (privacy policy, terms) |

### Common mistakes
- Sitemap uses `www.domain.com` but canonicals use `domain.com` (or vice versa) — must match
- New pages added to the site but never added to the sitemap
- 404 pages in the sitemap
- Staging URLs in the sitemap

### robots.txt must point to sitemap
```
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://yourdomain.com/sitemap.xml
```

### Automation (recommended)
For Astro, use `@astrojs/sitemap` integration instead of a static file:
```bash
npm install @astrojs/sitemap
```
```js
// astro.config.mjs
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://yourdomain.com',
  integrations: [sitemap()],
});
```
This auto-generates `/sitemap-index.xml` on every build and never misses new pages.

---

## 6. Canonicals & URL Consistency

### www vs non-www
Pick one. Redirect the other. Be consistent in:
- `astro.config.mjs` → `site: 'https://yourdomain.com'`
- `sitemap.xml` → all `<loc>` entries
- `robots.txt` → `Sitemap:` line
- Any hardcoded URLs in schema or OG tags

### Trailing slashes
Pick one (`/about` vs `/about/`). In Astro, set `trailingSlash: 'never'` or `'always'` in config — never leave it to chance.

### HTTPS
All canonical URLs must be HTTPS. Never reference `http://` anywhere.

---

## 7. robots.txt

Minimal correct robots.txt:
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: https://yourdomain.com/sitemap.xml
```

- `Allow: /` is redundant but harmless
- Disallow API routes, admin areas, staging paths
- Do NOT disallow `/assets/` — it blocks Google from crawling images and JS/CSS needed for rendering
- One `Sitemap:` directive pointing to your sitemap

---

## 8. Audit Checklist — Run This Per Site

### Initial setup (one-time)
- [ ] `<title>` format defined and applied to every page
- [ ] `<meta description>` written for every page (unique, 140–155 chars)
- [ ] `<link rel="canonical">` present and correct on every page
- [ ] OG image created (1200×630 PNG, under 300KB) and file confirmed to exist
- [ ] All OG tags present: `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`
- [ ] All Twitter tags present: `twitter:card`, `twitter:site`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`
- [ ] Organization schema on every page
- [ ] FAQ schema on FAQ page
- [ ] Article schema on every article/blog page
- [ ] Service schema on core service pages
- [ ] Sitemap includes all indexable pages
- [ ] Sitemap domain matches canonical domain (no www mismatch)
- [ ] robots.txt points to sitemap
- [ ] www → non-www redirect (or vice versa) configured at DNS/CDN level
- [ ] `trailingSlash` configured in Astro config

### Per new page (add to dev checklist)
- [ ] Unique `<title>` with primary keyword, 50–60 chars
- [ ] Unique `<meta description>`, 140–155 chars, contains keyword
- [ ] Added to `sitemap.xml` (or confirm sitemap is auto-generated)
- [ ] Page-specific schema added if applicable (FAQ, Article, Service)
- [ ] `og:type` set to `article` if it's an article/blog post

### Quarterly audit
- [ ] Run all pages through Google Rich Results Test
- [ ] Check Google Search Console for crawl errors, missing descriptions, duplicate titles
- [ ] Verify sitemap submission status in Search Console
- [ ] Check for any new pages missing from sitemap
- [ ] Review titles/descriptions for pages that have dropped in rankings

---

## 9. Tools

| Tool | Use |
|---|---|
| [Google Rich Results Test](https://search.google.com/test/rich-results) | Validate schema, see which rich results are eligible |
| [Schema Validator](https://validator.schema.org) | Detailed schema validation |
| [OpenGraph.xyz](https://www.opengraph.xyz) | Preview how a URL looks when shared on social |
| [metatags.io](https://metatags.io) | Preview meta tags across Google, Facebook, Twitter, LinkedIn |
| [Google Search Console](https://search.google.com/search-console) | Submit sitemap, monitor indexing, find errors |
| [Ahrefs Site Audit](https://ahrefs.com/site-audit) | Crawl-based SEO audit — finds missing meta, broken links, etc |
| [Screaming Frog](https://www.screamingfrog.co.uk/seo-spider/) | Free crawl tool for auditing titles, descriptions, canonicals |

---

## 10. Astro-Specific Notes

### Avoid these gotchas
- **ViewTransitions + JSON-LD**: With ViewTransitions, the `<head>` persists between page navigations, which means schema from a previous page can linger. Use `transition:persist` carefully — avoid it on `<script type="application/ld+json">` tags. The per-page schema approach (injecting via `pageSchema` prop) handles this correctly since it's part of the server-rendered head.
- **`Astro.site` must be set**: Without `site` in `astro.config.mjs`, canonical URLs will be relative. Always set it.
- **`security.checkOrigin`**: If your site is deployed on a different domain than `site` (e.g. `vercel.app` vs your custom domain), Astro's CSRF protection will block all form POSTs. Set `security: { checkOrigin: false }` until the custom domain is live.
- **Static sitemap goes stale**: Consider `@astrojs/sitemap` integration instead of maintaining `public/sitemap.xml` by hand.

---

*Last updated: May 2026 | Applies to Astro 5 SSR sites deployed on Vercel*
