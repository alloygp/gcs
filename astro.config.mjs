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
    sitemap({
      // auto-generates /sitemap-index.xml on every build — no manual sitemap.xml needed.
      filter: (page) => !page.includes('/admin'), // keep the unlisted shop settings page out of the sitemap
    }),
  ],

  prefetch: { prefetchAll: true },

  // Prevents CSRF errors when testing on vercel.app before custom domain is live
  security: { checkOrigin: false },

  build: {
    // Embeds all CSS as inline <style> tags — eliminates render-blocking stylesheet request
    inlineStylesheets: 'always',
  },

  redirects: {
    // Legacy 301 map — every old-site URL (Screaming Frog crawl) -> new slug.
    // Slash-less to match trailingSlash:'never'. Generated from launch-readiness map.
    '/contact-us': '/appointments',
    '/bmw-service': '/bmw-repair-san-antonio',
    '/now-hiring-technicians': '/about',
    '/mercedes-service-san-antonio': '/mercedes-repair-san-antonio',
    '/services': '/',
    '/audi-service': '/audi-repair-san-antonio',
    '/news': '/shop-notes',
    '/porsche-service': '/porsche-repair-san-antonio',
    '/lost-keys-and-wheel-locks-for-a-luxury-car-its-not-the-challenge-you-think': '/',
    // Key & fob replacement service removed per client — 301 the old page to home.
    '/german-car-key-replacement-san-antonio': '/',
    '/dealership-service-vs-repair-shop': '/independent-vs-dealer-german-auto-service',
    '/service-announcement': '/shop-notes',
    '/texas-winter-weather-update-we-are-closed': '/shop-notes',
    '/german-car-specialist': '/',
    '/german-car-values': '/blog/are-german-cars-worth-it',
    '/category/audi-2': '/shop-notes',
    '/ev-evolution': '/shop-notes',
    '/valentines-day': '/shop-notes',
    '/category/maintenance': '/shop-notes',
    '/category/porsche-3': '/shop-notes',
    '/category/workshop': '/shop-notes',
    '/category/news': '/shop-notes',
    '/category/bmw': '/shop-notes',
    '/long-term-car-storage': '/blog/long-term-car-storage',
    '/category/vw': '/shop-notes',
    '/category/performance': '/shop-notes',
    '/category/repair': '/shop-notes',
    '/bmw-common-oil-leaks-part': '/german-car-oil-leak-repair-san-antonio',
    '/summer-car-maintenance': '/blog/summer-car-maintenance',
    '/porsche-911-coolant-pipe-fix': '/porsche-ims-bearing-repair-san-antonio',
    '/bmw-m5-carbon-build-up-done-right-way': '/bmw-carbon-buildup-cleaning-san-antonio',
    '/important-bmw-m5-m6-rod-bearing-information': '/bmw-repair-san-antonio',
    '/category/uncategorized': '/shop-notes',
    '/bmw-n54-coolant-system-service': '/german-car-coolant-leak-repair-san-antonio',
    '/audi-service-2-0t-fsi-timing-belt': '/audi-repair-san-antonio',
    '/porsche-service-san-antonio-997-turbo': '/porsche-repair-san-antonio',
    '/ln-engineering-upgrade-2004-911-40th-anniversary': '/porsche-repair-san-antonio',
    '/we-are-hiring': '/about',
    '/new-bbi-991-gt3-roll-bar': '/porsche-repair-san-antonio',
    '/porsche-repairs-in-san-antonio': '/porsche-repair-san-antonio',
    '/porsche-service-2005-911-turbo-s': '/porsche-repair-san-antonio',
    '/audi-service-center': '/audi-repair-san-antonio',
    '/superior-european-auto-service': '/',
    '/premium-oil-change-kits-3-0tfsi-supercharged-audivw-motors-b8-s4': '/audi-repair-san-antonio',
    '/announcement-dbc-tuning-name-change': '/shop-notes',
    '/b8-5-s4-bbs-chr-michelin-pss-spc-adjustable-arms-and-specialty-alignment': '/audi-repair-san-antonio',
    '/nicholas-sick-b8-s4-eurocode-goodies': '/audi-repair-san-antonio',
    '/bmw-service-san-antonio': '/bmw-repair-san-antonio',
    '/tim-schmeltzers-k04-b8-a4': '/audi-repair-san-antonio',
    '/san-antonio-audi-service': '/audi-repair-san-antonio',
    '/20-diverter-valve': '/audi-repair-san-antonio',
    '/porsche-repairs-precision-care': '/porsche-repair-san-antonio',
    '/2008-vw-r32-full-brake-refresh': '/',
    '/vwservice': '/',
    '/spm-vw-mk56-products-now-available-at-dbc-tuning': '/shop-notes',
    '/fsi-ignition-kits-on-sale': '/shop-notes',
    '/awe-releases-porsche-997-2-s-flo-filters-in-transit-to-us': '/shop-notes',
    '/2006-porsche-cayenne-s-visits-for-coolant-pipes': '/porsche-repair-san-antonio',
    '/kw-v1-coilovers-on-fiat-500-abarth': '/',
    '/alignment': '/',
    '/2007-bentley-continental-gt-convertible': '/',
    '/employment-opportunity-technicians': '/about',
    '/porsche-944-turbo-build-part-1-drivetrain-separation': '/porsche-repair-san-antonio',
    '/2008-special-edition-orange-boxster-s-gets-fabspeed-exhaust-and-hr-springs': '/porsche-repair-san-antonio',
    '/ferrari-f430-scheduled-maintenance': '/',
    '/2012-vw-golf-r-slammage-of-boredom': '/',
    '/2012-audi-s4-suspension-install-and-alignment-eurocode-goodies': '/audi-repair-san-antonio',
    '/ferrari-f430-scuderia-factory-scheduled-maintenance': '/',
    '/porsche-service-san-antonio-honest': '/porsche-repair-san-antonio',
    '/ferrari-f360-headlight-replacement': '/',
    '/new-product-release-apr-tt-rs-2-5-tfsi-rsc-exhaust-system': '/shop-notes',
    '/jennifers-2010-porsche-gt3': '/porsche-repair-san-antonio',
    '/2011-audi-s4-milltek-full-exhaust-system-install': '/audi-repair-san-antonio',
    '/porsche-service-san-antonio-996tt': '/porsche-repair-san-antonio',
    '/bmw-m6-spec-twin-disc-clutch-installation': '/bmw-repair-san-antonio',
    '/2011-audi-r8-v10-supersprint-exhaust-system-install': '/audi-repair-san-antonio',
    '/awe-b8-s5-touring-exhaust-install-pictures': '/audi-repair-san-antonio',
    '/bb-golf-r-exhaust-systems-now-available': '/shop-notes',
    '/awesomeness': '/shop-notes',
    '/2009-porsche-997-2-c2-hr-springs-and-alignment': '/porsche-repair-san-antonio',
    '/category/audi-2/page/2': '/shop-notes',
    '/category/audi-2/page/3': '/shop-notes',
    '/3-2-1-lets-blog': '/shop-notes',
    '/category/workshop/page/2': '/shop-notes',
    '/category/porsche-3/page/2': '/shop-notes',
    '/category/maintenance/page/2': '/shop-notes',
    '/estimates': '/appointments',
    // backlinked/ranking old URLs found in post-launch Ahrefs audit (had live
    // referring domains but no redirect — were 404ing and leaking link equity).
    '/about-german-car-specialists': '/about',     // 5 refdomains (old site 301'd here)
    '/bosch-service-center': '/',                   // 5 refdomains
    '/car-alignment-specialists': '/',              // 3 refdomains (cf. /alignment)
    '/volkswagen-service': '/',                     // 3 refdomains (cf. /vwservice)
    '/european-car-repair-san-antonio': '/',        // 2 refdomains
    '/author/gcs': '/shop-notes',                   // 3 refdomains (WP author archive)
    '/author/berk': '/shop-notes',                  // 2 refdomains (WP author archive)
    // internal aliases
    '/contact': '/appointments',
    '/book': '/appointments',
  },
});
