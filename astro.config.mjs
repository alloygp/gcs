// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // ── STEP 1: update to client's live domain ────────────────────
  site: 'https://clientsite.com',

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

  redirects: {
    // Add legacy URL redirects here as needed
    // '/old-path': '/new-path',
  },
});
