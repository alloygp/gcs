// src/lib/shopmonkey.ts
//
// Thin client for the Shopmonkey REST API v3.
// Used by src/pages/api/appointments.ts to push website appointment
// requests into the shop's Shopmonkey account (customer + appointment).
//
// Auth is an OAuth bearer token (an API key created in Shopmonkey under
// Settings → Integration → API Keys). It lives ONLY in server-side env vars —
// never ship it to the browser, never commit it.
//
// Design principle: this integration must NEVER lose a lead. Every call is
// best-effort. If Shopmonkey is misconfigured or down, the caller still emails
// the shop with the full request details, so a human can enter it manually.

const API_BASE =
  import.meta.env.SHOPMONKEY_API_BASE?.toString().trim() ||
  'https://api.shopmonkey.cloud/v3';

const API_KEY      = import.meta.env.SHOPMONKEY_API_KEY?.toString().trim() ?? '';
// companyId/locationId are derived from the API key — not required in bodies.
// LOCATION_ID is sent only when set (matters for HQ/multi-location keys).
const LOCATION_ID  = import.meta.env.SHOPMONKEY_LOCATION_ID?.toString().trim() ?? '';

// How long (minutes) to block out for a website request. The shop adjusts the
// real duration when they confirm; this is just a placeholder slot.
const DEFAULT_DURATION_MIN = Number(
  import.meta.env.SHOPMONKEY_DEFAULT_DURATION_MIN ?? 60
);

// UTC offset for the shop's local time, e.g. "-07:00". The form collects a
// wall-clock date + time; we stamp it with this offset to build a correct ISO
// instant. Leave blank to treat the input as UTC. Either way the human-readable
// requested time is ALSO written into the appointment note + the shop email,
// so the shop always sees the intended slot even if the offset is wrong.
const TZ_OFFSET = import.meta.env.SHOPMONKEY_TZ_OFFSET?.toString().trim() ?? '';

// Only the API key is strictly required — the key scopes company + location
// automatically (verified against the live v3 API). LOCATION_ID is sent only
// when set, which matters for multi-location/HQ keys.
export const shopmonkeyConfigured = Boolean(API_KEY);

export interface AppointmentRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Service the customer is requesting, e.g. "Oil change". Becomes the appt name. */
  service: string;
  /** Free-text vehicle description for the note/title, e.g. "2018 BMW 330i". */
  vehicle: string;
  /** Structured vehicle fields used to create a linked Shopmonkey Vehicle. */
  make?: string;
  model?: string;
  year?: number | undefined;
  vin?: string;
  /** YYYY-MM-DD from the form's date input. */
  preferredDate: string;
  /** HH:MM (24h) from the form's time input. */
  preferredTime: string;
  /** Extra notes from the customer. */
  message: string;
}

export interface ShopmonkeyResult {
  ok: boolean;
  customerId?: string | undefined;
  vehicleId?: string | undefined;
  appointmentId?: string | undefined;
  /** Human-readable summary of what happened, for logs + the shop email. */
  detail: string;
}

/** Build an ISO 8601 instant from the form's wall-clock date + time. */
function toIso(date: string, time: string): string {
  // Default to Central (San Antonio) so the placeholder slot isn't 5h off when
  // SHOPMONKEY_TZ_OFFSET isn't set. CDT = -05:00; off by 1h in winter (CST),
  // which is fine — the shop reschedules, and the note carries the exact time.
  const suffix = TZ_OFFSET || '-05:00';
  // e.g. "2026-06-10T09:00:00-05:00"
  return `${date}T${time}:00${suffix}`;
}

/**
 * Best-effort E.164 normalization for US numbers. Shopmonkey stores phone as
 * E.164 (e.g. "+12105550199"). 10 digits → assume +1; 11 starting with 1 → +.
 * Anything else is passed through unchanged.
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.trim();
}

async function smFetch(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON response — keep raw text for the error message
  }

  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? text ?? `HTTP ${res.status}`;
    throw new Error(`Shopmonkey ${path} → ${res.status}: ${msg}`);
  }
  // v3 responses are typically wrapped as { success, data }.
  return json?.data ?? json;
}

/**
 * Create a customer, then an appointment linked to that customer.
 * Returns a structured result; never throws — failures are reported in `detail`.
 */
export async function createAppointmentRequest(
  req: AppointmentRequest
): Promise<ShopmonkeyResult> {
  if (!shopmonkeyConfigured) {
    return {
      ok: false,
      detail:
        'Shopmonkey not configured (missing SHOPMONKEY_API_KEY or SHOPMONKEY_LOCATION_ID).',
    };
  }

  const startDate = toIso(req.preferredDate, req.preferredTime);
  const endDate = new Date(
    new Date(startDate).getTime() + DEFAULT_DURATION_MIN * 60_000
  ).toISOString();

  const humanSlot = `${req.preferredDate} at ${req.preferredTime}`;
  const fullName = [req.firstName, req.lastName].filter(Boolean).join(' ');
  const contact = [req.email, req.phone].filter(Boolean).join(' · ');

  // locationId is optional; only sent when configured (HQ/multi-location keys).
  const locationField = LOCATION_ID ? { locationId: LOCATION_ID } : {};

  // Create the customer first so we can link it (and so we know if it failed
  // before writing the note).
  let customerId: string | undefined;
  let customerError: string | undefined;
  try {
    const customer = await smFetch('/customer', {
      ...locationField,
      customerType: 'Customer',
      firstName: req.firstName,
      lastName: req.lastName,
      // Shopmonkey models contact info as nested arrays (verified against v3).
      emails: req.email
        ? [{ email: req.email, primary: true, subscribed: false, marketingOptIn: false }]
        : [],
      phoneNumbers: req.phone
        ? [{ number: normalizePhone(req.phone), type: 'Mobile', primary: true }]
        : [],
    });
    customerId = customer?.id;
  } catch (err) {
    // Non-fatal: we still create the appointment with contact info in the note.
    customerError = err instanceof Error ? err.message : String(err);
    console.error('Shopmonkey customer create failed:', err);
  }

  // Create the vehicle (linked to the customer) so the appointment's Vehicle
  // field is populated. `size` is required. VIN doesn't auto-decode, so we also
  // send make/model/year. Best-effort — failure just leaves the car in the note.
  let vehicleId: string | undefined;
  let vehicleError: string | undefined;
  if (req.vin || req.make || req.model) {
    try {
      const vehicle = await smFetch('/vehicle', {
        ...locationField,
        size: 'LightDuty',
        ...(customerId ? { customerId } : {}),
        ...(req.vin ? { vin: req.vin } : {}),
        ...(req.year ? { year: req.year } : {}),
        ...(req.make ? { make: req.make } : {}),
        ...(req.model ? { model: req.model } : {}),
      });
      vehicleId = vehicle?.id;
    } catch (err) {
      vehicleError = err instanceof Error ? err.message : String(err);
      console.error('Shopmonkey vehicle create failed:', err);
    }
  }

  // Name + contact go in the note too, so the shop sees who it is even when the
  // customer record can't be linked. If linking failed, record WHY in the note
  // so it's diagnosable straight from the Shopmonkey appointment.
  const vehicleLine = [req.vehicle, req.vin ? `VIN ${req.vin}` : '']
    .filter(Boolean)
    .join(' · ');
  const note = [
    'Website appointment request (unconfirmed — review and confirm in Shopmonkey).',
    fullName ? `Name: ${fullName}` : '',
    `Requested: ${humanSlot}`,
    vehicleLine ? `Vehicle: ${vehicleLine}` : '',
    req.message ? `Notes: ${req.message}` : '',
    contact ? `Contact: ${contact}` : '',
    customerId ? '' : `(Customer not auto-linked${customerError ? ` — ${customerError}` : ''})`,
    (req.vin || req.make || req.model) && !vehicleId
      ? `(Vehicle not auto-linked${vehicleError ? ` — ${vehicleError}` : ''})`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const appointment = await smFetch('/appointment', {
      ...locationField,
      name: req.service || 'Website appointment request',
      startDate,
      endDate,
      ...(customerId ? { customerId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      note,
      color: 'blue',
      // Do NOT auto-message the customer or auto-confirm — the shop owns that.
      sendConfirmation: false,
      sendReminder: false,
      useEmail: false,
      useSMS: false,
    });

    const parts = [
      `appointment ${appointment?.id ?? '(unknown id)'}`,
      customerId ? `customer ${customerId}` : 'no customer (create failed — see note)',
    ];
    if (vehicleId) parts.push(`vehicle ${vehicleId}`);
    else if (req.vin || req.make || req.model) parts.push('no vehicle (create failed — see note)');
    return {
      ok: true,
      customerId,
      vehicleId,
      appointmentId: appointment?.id,
      detail: `Created Shopmonkey ${parts.join(', ')}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Shopmonkey appointment create failed:', err);
    return {
      ok: false,
      customerId,
      detail: `Shopmonkey appointment create failed: ${message}`,
    };
  }
}
