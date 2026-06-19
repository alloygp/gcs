// src/pages/api/booking-config.ts
// Public read endpoint the appointments calendar fetches on load to learn the
// earliest selectable drop-off date. Returns { floor: "YYYY-MM-DD" }.
import type { APIRoute } from 'astro';
import { getBookingConfig } from '~/lib/booking-config';

export const prerender = false; // server route — must not be statically built

export const GET: APIRoute = async () => {
  const { floor, blackout } = await getBookingConfig();
  return new Response(JSON.stringify({ floor, blackout }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Short cache so a shop edit shows on the customer calendar within a few seconds
      // (no build — saves write straight to Edge Config). stale-while-revalidate keeps
      // the endpoint snappy under load while still refreshing in the background.
      'cache-control': 'public, max-age=5, stale-while-revalidate=30',
    },
  });
};
