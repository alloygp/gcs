/**
 * src/config/site.ts
 * Single source of truth for site-wide SEO defaults.
 * Edit this file for each client — never hardcode these values elsewhere.
 */

export const SITE = {
  /** Canonical base URL — no trailing slash. Must match astro.config.mjs site: */
  url: 'https://mygermancarsa.com',

  /** Display name — used in og:site_name, JSON-LD, email footer */
  name: 'German Car Specialists',

  /** Twitter/X handle — include the @ */
  twitterHandle: '@german_car_specialists',

  /** og:locale */
  locale: 'en_US',

  /** Fallback <title> if a page doesn't pass its own */
  defaultTitle: 'German Car Specialists — Expert German auto service in San Antonio',

  /** Fallback meta description */
  defaultDescription: 'German Car Specialists in San Antonio, TX — expert service and repair for Audi, BMW, Porsche, Mercedes-Benz, and Volkswagen. Trusted independent German auto specialists.',

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
    telephone: '+1-210-399-1172',
    email: 'contact@mygermancarsa.com',
    addressLocality: 'San Antonio',
    addressRegion: 'TX',
    addressCountry: 'US',
    areaServed: 'United States',
    priceRange: '$$',
    logo: 'https://mygermancarsa.com/assets/logo-color.png',
  },
} as const;
