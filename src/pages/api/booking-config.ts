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
      // Date changes rarely; a short cache keeps the page snappy while still
      // surfacing a shop edit within ~30s.
      'cache-control': 'public, max-age=30',
    },
  });
};
