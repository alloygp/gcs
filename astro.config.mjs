// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // ── STEP 1: update to client's live domain ────────────────────
  site: 'https://mygermancarsa.com',

  output: 'server',
  adapter: vercel(),
  trailingSlash: 'never',

  integrations: [
    react(),
    sitemap(), // auto-generates /sitemap-index.xml on every build — no manual sitemap.xml needed
  ],

  prefetch: { prefetchAll: true },

  // Prevents CSRF errors when testing on vercel.app before custom domain is live
  security: { checkOrigin: false },

  build: {
    // Embeds all CSS as inline <style> tags — eliminates render-blocking stylesheet request
    inlineStylesheets: 'always',
  },

  // 301 redirects: legacy WordPress URLs -> new slugs (preserve link equity).
  // Sources/targets are slash-less to match trailingSlash:'never'. Vercel normalizes
  // a trailing-slash request (e.g. /contact/) to /contact before the rule fires.
  // NOTE: verify every legacy slug against Search Console before launch.
  redirects: {
    // reframed service pages
    '/lost-keys-and-wheel-locks-for-a-luxury-car-its-not-the-challenge-you-think': '/german-car-key-replacement-san-antonio',
    '/bmw-n54-coolant-system-service': '/german-car-coolant-leak-repair-san-antonio',
    '/bmw-common-oil-leaks-part': '/german-car-oil-leak-repair-san-antonio',
    '/bmw-m5-carbon-buildup': '/bmw-carbon-buildup-cleaning-san-antonio',
    '/porsche-911-coolant-pipe-failure': '/porsche-ims-bearing-repair-san-antonio',
    // blog posts (legacy -> /blog/)
    '/long-term-car-storage': '/blog/long-term-car-storage',
    '/summer-car-maintenance': '/blog/summer-car-maintenance',
    '/german-car-values': '/blog/are-german-cars-worth-it',
    // consolidated / merged pages
    '/dealership-service-vs-repair-shop': '/independent-vs-dealer-german-auto-service',
    '/german-car-specialist': '/',
    // contact + book merged into appointments
    '/contact': '/appointments',
    '/book': '/appointments',
  },
});
