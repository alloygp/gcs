// src/lib/schema.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reusable JSON-LD schema builder functions.
//
// Usage in a .astro page:
//
//   import { breadcrumbSchema, faqSchema, serviceSchema } from '~/lib/schema';
//   import { SITE } from '~/config/site';
//
//   const breadcrumb = breadcrumbSchema([
//     { name: 'Home',     url: SITE.url + '/' },
//     { name: 'Services', url: SITE.url + '/services' },
//     { name: 'SEO',      url: SITE.url + '/services/seo' },
//   ]);
//
//   const faq = faqSchema([
//     { q: 'What do you do?', a: 'We do great things.' },
//   ]);
//
//   Then pass to BaseLayout:
//   <BaseLayout pageSchema={[breadcrumb, faq]} ...>
// ─────────────────────────────────────────────────────────────────────────────

import { SITE } from '~/config/site';

// ── Organization ─────────────────────────────────────────────────────────────
// Already rendered by BaseLayout on every page. Import this only if you need
// to reference the org object inside another schema (e.g. Article publisher).

export function orgSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': SITE.org.type,
    name: SITE.name,
    url: SITE.url,
    logo: SITE.org.logo,
    telephone: SITE.org.telephone,
    email: SITE.org.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.org.addressLocality,
      addressRegion: SITE.org.addressRegion,
      addressCountry: SITE.org.addressCountry,
    },
    areaServed: SITE.org.areaServed,
    priceRange: SITE.org.priceRange,
  };
}

// ── BreadcrumbList ────────────────────────────────────────────────────────────
// items: ordered array from Home → current page.

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ── FAQPage ───────────────────────────────────────────────────────────────────
// faqs: array of question/answer pairs.
// Keep answers identical to the on-page text — Google penalises mismatches.

export function faqSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export function serviceSchema(opts: {
  name: string;
  description: string;
  url: string;
  image?: string;
  areaServed?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    provider: {
      '@type': SITE.org.type,
      name: SITE.name,
      url: SITE.url,
    },
    areaServed: opts.areaServed ?? SITE.org.areaServed,
    ...(opts.image ? { image: opts.image } : {}),
  };
}

// ── Article ───────────────────────────────────────────────────────────────────
// Use for blog posts, resource articles, guides. ogType="article" on the route.

export function articleSchema(opts: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;   // ISO 8601: '2026-05-13'
  dateModified?: string;
  image?: string;
  about?: string[];        // topic names
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: SITE.org.logo },
    },
    mainEntityOfPage: opts.url,
    inLanguage: 'en-US',
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.about
      ? { about: opts.about.map((name) => ({ '@type': 'Thing', name })) }
      : {}),
  };
}

// ── Course ────────────────────────────────────────────────────────────────────

export function courseSchema(opts: {
  name: string;
  description: string;
  url: string;
  free?: boolean;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    isAccessibleForFree: opts.free ?? true,
    inLanguage: 'en-US',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
}

// ── LocalBusiness ─────────────────────────────────────────────────────────────
// Use on the Contact or About page when you want the full local business card.

export function localBusinessSchema(opts?: { description?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE.name,
    url: SITE.url,
    logo: SITE.org.logo,
    telephone: SITE.org.telephone,
    email: SITE.org.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.org.addressLocality,
      addressRegion: SITE.org.addressRegion,
      addressCountry: SITE.org.addressCountry,
    },
    areaServed: SITE.org.areaServed,
    priceRange: SITE.org.priceRange,
    ...(opts?.description ? { description: opts.description } : {}),
  };
}
