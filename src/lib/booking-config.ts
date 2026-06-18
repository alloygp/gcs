// src/lib/booking-config.ts
// Single source of truth for online-booking availability:
//   bookingFloor  — earliest date customers may request (YYYY-MM-DD)
//   blackoutDates — specific closed days that are also blocked (string[])
//
// Both live in a Vercel Edge Config so the shop can change them at /admin/booking
// with no code deploy. Reads go through the connection string (EDGE_CONFIG); writes
// happen in src/pages/api/admin/booking.ts via the Vercel REST API.
//
// Every read falls back to safe defaults if the store is unset/unreachable/invalid,
// so the appointments calendar can never break.

const DEFAULT_FLOOR = '2026-06-24';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface BookingConfig {
  floor: string;
  blackout: string[];
}

/** Read the full booking config (floor + blackout dates). Never throws. */
export async function getBookingConfig(): Promise<BookingConfig> {
  const fallback: BookingConfig = { floor: DEFAULT_FLOOR, blackout: [] };
  const conn = import.meta.env.EDGE_CONFIG;
  if (!conn) return fallback;
  // Connection string: https://edge-config.vercel.com/<ecfg_id>?token=<readToken>
  const m = String(conn).match(/edge-config\.vercel\.com\/(ecfg_[^/?]+)\?token=([^&\s]+)/);
  if (!m) return fallback;
  try {
    const res = await fetch(`https://edge-config.vercel.com/${m[1]}/items?token=${m[2]}`);
    if (!res.ok) return fallback;
    const all = await res.json();
    const floor = typeof all.bookingFloor === 'string' && ISO_DATE.test(all.bookingFloor) ? all.bookingFloor : DEFAULT_FLOOR;
    const blackout = Array.isArray(all.blackoutDates)
      ? all.blackoutDates.filter((s: unknown): s is string => typeof s === 'string' && ISO_DATE.test(s))
      : [];
    return { floor, blackout };
  } catch {
    return fallback;
  }
}

export { DEFAULT_FLOOR, ISO_DATE };
