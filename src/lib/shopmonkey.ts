// src/lib/shopmonkey.ts
//
// Thin client for the Shopmonkey REST API v3.
// Used by src/pages/api/appointment.ts to push website leads into Shopmonkey:
// it creates a customer + vehicle, then an ORDER dropped into the first
// Workflow board column ("Customer Pool & Appointments") — NOT a calendar
// appointment. The shop works the lead down the board.
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

const API_KEY = import.meta.env.SHOPMONKEY_API_KEY?.toString().trim() ?? '';
// companyId/locationId are derived from the API key — not required in bodies.
// LOCATION_ID is sent only when set (matters for HQ/multi-location keys).
const LOCATION_ID = import.meta.env.SHOPMONKEY_LOCATION_ID?.toString().trim() ?? '';

// The Workflow board column new leads land in. Defaults to this shop's
// "Customer Pool & Appointments" column; override per account via env.
const WORKFLOW_STATUS_ID =
  import.meta.env.SHOPMONKEY_WORKFLOW_STATUS_ID?.toString().trim() ||
  '64305ec142c03dbb1d5a974e';

// Only the API key is strictly required — the key scopes company + location.
export const shopmonkeyConfigured = Boolean(API_KEY);

export interface LeadRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Short title for the order, e.g. "Book a service — Audi A6: Tires". */
  service: string;
  /** Free-text vehicle description for the order complaint, e.g. "2019 Audi A6". */
  vehicle: string;
  /** Structured vehicle fields used to create a linked Shopmonkey Vehicle. */
  make?: string;
  model?: string;
  year?: number | undefined;
  vin?: string;
  /** YYYY-MM-DD from the form's date input (optional). */
  preferredDate?: string;
  /** Extra context (intent + the customer's message). */
  message: string;
}

export interface ShopmonkeyResult {
  ok: boolean;
  customerId?: string | undefined;
  vehicleId?: string | undefined;
  orderId?: string | undefined;
  /** Human-readable summary of what happened, for logs + the shop email. */
  detail: string;
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
 * Create a customer + vehicle, then an order on the Workflow board.
 * Returns a structured result; never throws — failures are reported in `detail`.
 */
export async function createLead(req: LeadRequest): Promise<ShopmonkeyResult> {
  if (!shopmonkeyConfigured) {
    return { ok: false, detail: 'Shopmonkey not configured (missing SHOPMONKEY_API_KEY).' };
  }

  const fullName = [req.firstName, req.lastName].filter(Boolean).join(' ');
  const contact = [req.email, req.phone].filter(Boolean).join(' · ');
  const vehicleLine = [req.vehicle, req.vin ? `VIN ${req.vin}` : ''].filter(Boolean).join(' · ');

  // locationId is optional; only sent when configured (HQ/multi-location keys).
  const locationField = LOCATION_ID ? { locationId: LOCATION_ID } : {};

  // 1. Customer
  let customerId: string | undefined;
  let customerPhoneId: string | undefined; // set on the order so the card shows the phone
  let customerEmailId: string | undefined;
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
    customerPhoneId = customer?.phoneNumbers?.[0]?.id;
    customerEmailId = customer?.emails?.[0]?.id;
  } catch (err) {
    customerError = err instanceof Error ? err.message : String(err);
    console.error('Shopmonkey customer create failed:', err);
  }

  // 2. Vehicle (linked to the customer). `size` is required.
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

  // 3. Order on the Workflow board. The complaint carries the lead detail
  //    (orders have no calendar slot). Failures to link are recorded inline.
  const complaint = [
    'Website lead — created from the appointment form.',
    fullName ? `Name: ${fullName}` : '',
    req.preferredDate ? `Requested date: ${req.preferredDate}` : '',
    vehicleLine ? `Vehicle: ${vehicleLine}` : '',
    req.message ? req.message : '',
    contact ? `Contact: ${contact}` : '',
    customerId ? '' : `(Customer not auto-linked${customerError ? ` — ${customerError}` : ''})`,
    (req.vin || req.make || req.model) && !vehicleId
      ? `(Vehicle not auto-linked${vehicleError ? ` — ${vehicleError}` : ''})`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const order = await smFetch('/order', {
      ...locationField,
      workflowStatusId: WORKFLOW_STATUS_ID,
      name: req.service || 'Website lead',
      complaint,
      ...(customerId ? { customerId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      // Point the order at the customer's contact so the board card shows them.
      ...(customerPhoneId ? { phoneNumberId: customerPhoneId } : {}),
      ...(customerEmailId ? { emailId: customerEmailId } : {}),
    });

    const okBits: string[] = [];
    const failBits: string[] = [];
    if (customerId) okBits.push('customer'); else failBits.push('customer');
    if (vehicleId) okBits.push('vehicle');
    else if (req.vin || req.make || req.model) failBits.push('vehicle');
    let linked = okBits.length ? `${okBits.join(' + ')} linked` : '';
    if (failBits.length) linked += `${linked ? '; ' : ''}${failBits.join(' + ')} not auto-linked (see complaint)`;

    return {
      ok: true,
      customerId,
      vehicleId,
      orderId: order?.id,
      detail: `Added to the Workflow board (Customer Pool & Appointments)${linked ? ` — ${linked}` : ''}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Shopmonkey order create failed:', err);
    return {
      ok: false,
      customerId,
      vehicleId,
      detail: `Shopmonkey order create failed: ${message}`,
    };
  }
}
