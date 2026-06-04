/**
 * src/config/site.ts
 * Single source of truth for site-wide SEO defaults.
 * Edit this file for each client — never hardcode these values elsewhere.
 */

export const SITE = {
  /** Canonical base URL — no trailing slash. Must match astro.config.mjs site: */
  url: 'https://clientsite.com',

  /** Display name — used in og:site_name, JSON-LD, email footer */
  name: 'Client Name',

  /** Twitter/X handle — include the @ */
  twitterHandle: '@clienthandle',

  /** og:locale */
  locale: 'en_US',

  /** Fallback <title> if a page doesn't pass its own */
  defaultTitle: 'Client Name — Short tagline here',

  /** Fallback meta description */
  defaultDescription: 'One sentence describing what the business does and who it serves.',

  /**
   * Default OG image — place the file at public/assets/og.png
   * Dimensions: 1200×630px PNG, under 300KB
   */
  defaultOgImage: '/assets/og.png',
  ogImageWidth:  '1200',
  ogImageHeight: '630',

  /** Organization JSON-LD — emitted on every page */
  org: {
    type: 'LocalBusiness',         // or 'ProfessionalService', 'Organization', etc.
    telephone: '+1-XXX-XXX-XXXX',
    email: 'contact@clientsite.com',
    addressLocality: 'City',
    addressRegion: 'TX',
    addressCountry: 'US',
    areaServed: 'United States',
    priceRange: '$$',
    logo: 'https://clientsite.com/assets/logo.svg',
  },
} as const;
