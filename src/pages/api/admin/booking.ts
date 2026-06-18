// src/pages/api/admin/booking.ts
// Password-gated write endpoint behind the shop's /admin/booking page.
//   GET  → { floor } so the form can prefill (no secret — same value as the public endpoint).
//   POST → validate password + date, then upsert `bookingFloor` into the Edge Config
//          via the Vercel REST API. The new date is live on the site within ~30s.
//
// Required env (set in Vercel):
//   ADMIN_BOOKING_PASSWORD  — the shop's password for this page
//   VERCEL_API_TOKEN        — a Vercel API token with write access (created in the dashboard)
//   VERCEL_TEAM_ID          — the team that owns the Edge Config
//   EDGE_CONFIG             — the read connection string (also used to derive the store id)
import type { APIRoute } from 'astro';
import { getBookingConfig, ISO_DATE } from '~/lib/booking-config';

export const prerender = false; // server route — must not be statically built

const ADMIN_PASSWORD = import.meta.env.ADMIN_BOOKING_PASSWORD;
const VERCEL_API_TOKEN = import.meta.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = import.meta.env.VERCEL_TEAM_ID;
const EDGE_CONFIG = import.meta.env.EDGE_CONFIG;

// Constant-time compare so the password isn't exposed to a timing attack.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Prefill: the current config isn't sensitive (it's already on the public endpoint).
export const GET: APIRoute = async () => json(await getBookingConfig(), 200);

export const POST: APIRoute = async ({ request }) => {
  if (!ADMIN_PASSWORD) return json({ error: 'Admin isn’t set up yet (no password configured).' }, 503);

  const data = await request.formData();
  const password = data.get('password')?.toString() ?? '';
  const date = data.get('date')?.toString().trim() ?? '';

  if (!safeEqual(password, ADMIN_PASSWORD)) return json({ error: 'Incorrect password.' }, 401);
  if (!ISO_DATE.test(date)) return json({ error: 'Please choose a valid date.' }, 400);

  // Blackout dates arrive as a JSON array string. Keep only valid, de-duped, sorted ISO dates.
  let blackout: string[] = [];
  try {
    const parsed = JSON.parse(data.get('blackout')?.toString() || '[]');
    if (Array.isArray(parsed)) {
      blackout = Array.from(new Set(parsed.filter((s) => typeof s === 'string' && ISO_DATE.test(s)))).sort();
    }
  } catch {
    return json({ error: 'Blackout dates were malformed.' }, 400);
  }

  const id = String(EDGE_CONFIG || '').match(/(ecfg_[^/?]+)/)?.[1];
  if (!VERCEL_API_TOKEN || !id) {
    return json({ error: 'Storage isn’t connected yet (missing API token). Ask your developer.' }, 503);
  }

  const url = `https://api.vercel.com/v1/edge-config/${id}/items${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${VERCEL_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      items: [
        { operation: 'upsert', key: 'bookingFloor', value: date },
        { operation: 'upsert', key: 'blackoutDates', value: blackout },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return json({ error: `Couldn’t save (Vercel said: ${detail.slice(0, 160)})` }, 502);
  }
  return json({ success: true, floor: date, blackout }, 200);
};
