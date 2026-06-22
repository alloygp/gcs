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
  /** Drop-off time window from the form's time select (optional). */
  preferredTime?: string;
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

async function smGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : undefined; } catch { /* keep raw */ }
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? text ?? `HTTP ${res.status}`;
    throw new Error(`Shopmonkey GET ${path} → ${res.status}: ${msg}`);
  }
  return json?.data ?? json;
}

// Shopmonkey's `where` query param is Prisma-style and filters on SCALAR fields
// (equals/contains work), but relation filters on emails[]/phoneNumbers[] are NOT
// honored. So to find an existing customer we narrow by a scalar (last/first name)
// and then confirm the match client-side by email or phone.
function whereParam(obj: unknown): string {
  return `where=${encodeURIComponent(JSON.stringify(obj))}`;
}

interface ExistingCustomer { id: string; phoneNumberId?: string; emailId?: string }

/** Find an existing customer by name, confirmed by a matching email or phone. Null if none. Never throws. */
async function findExistingCustomer(req: LeadRequest): Promise<ExistingCustomer | null> {
  const wantEmail = req.email.trim().toLowerCase();
  const wantPhone = normalizePhone(req.phone);
  if (!wantEmail && !wantPhone) return null; // nothing to confirm a match against
  const last = req.lastName?.trim();
  const first = req.firstName?.trim();
  const field = last ? 'lastName' : first ? 'firstName' : '';
  const value = last || first;
  if (!field || !value) return null;

  let candidates: any[] = [];
  try {
    candidates = await smGet(`/customer?limit=100&${whereParam({ [field]: value })}`);
  } catch (err) {
    console.error('Customer lookup failed (will create new):', err);
    return null;
  }
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const primaryOr = (arr: any[]) => arr?.find((x) => x.primary) ?? arr?.[0];
  // Prefer an email match (most unique), then a phone match.
  for (const c of candidates) {
    const em = wantEmail && (c.emails || []).find((e: any) => (e.email || '').trim().toLowerCase() === wantEmail);
    if (em) return { id: c.id, emailId: em.id, phoneNumberId: primaryOr(c.phoneNumbers || [])?.id };
  }
  for (const c of candidates) {
    const ph = wantPhone && (c.phoneNumbers || []).find((p: any) => normalizePhone(p.number || '') === wantPhone);
    if (ph) return { id: c.id, phoneNumberId: ph.id, emailId: primaryOr(c.emails || [])?.id };
  }
  return null;
}

/**
 * Create a customer + vehicle, then an order on the Workflow board.
 * Reuses an existing customer/vehicle when one matches (by email/phone, VIN) so
 * repeat leads don't pile up duplicates. Returns a structured result; never throws.
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

  // 1. Customer. Shopmonkey models contact info as nested arrays (verified
  //    against v3) and VALIDATES phone numbers — a bad one 400s the whole
  //    create. So if the first attempt fails, retry without the phone so the
  //    customer + name still link; the phone is preserved in the complaint.
  let customerId: string | undefined;
  let customerPhoneId: string | undefined; // set on the order so the card shows the phone
  let customerEmailId: string | undefined;
  let customerError: string | undefined;
  let matchedExisting = false;

  // 1a. First try to LINK to an existing customer (by name + email/phone) so repeat
  //     leads don't create duplicate customers. Falls through to create if no match.
  const existing = await findExistingCustomer(req);
  if (existing) {
    customerId = existing.id;
    customerPhoneId = existing.phoneNumberId;
    customerEmailId = existing.emailId;
    matchedExisting = true;
  }

  const emails = req.email
    ? [{ email: req.email, primary: true, subscribed: false, marketingOptIn: false }]
    : [];
  const phoneNumbers = req.phone
    ? [{ number: normalizePhone(req.phone), type: 'Mobile', primary: true }]
    : [];
  const customerBase = {
    ...locationField,
    customerType: 'Customer',
    firstName: req.firstName,
    lastName: req.lastName,
  };
  // Shopmonkey validates phone AND email; a bad one 400s the whole create.
  // Try the richest contact set first, then progressively drop the likely-bad
  // field so a VALID contact still attaches (a bad phone shouldn't lose a good
  // email, and vice-versa). Worst case, name-only still links the customer.
  const variants: Array<{ emails: typeof emails; phoneNumbers: typeof phoneNumbers }> = [
    { emails, phoneNumbers },
  ];
  if (phoneNumbers.length) variants.push({ emails, phoneNumbers: [] });          // drop phone, keep email
  if (emails.length && phoneNumbers.length) variants.push({ emails: [], phoneNumbers }); // drop email, keep phone
  if (emails.length || phoneNumbers.length) variants.push({ emails: [], phoneNumbers: [] }); // name only
  // 1b. No existing match → create a new customer.
  if (!matchedExisting) {
    for (const contacts of variants) {
      try {
        const customer = await smFetch('/customer', { ...customerBase, ...contacts });
        customerId = customer?.id;
        customerPhoneId = customer?.phoneNumbers?.[0]?.id;
        customerEmailId = customer?.emails?.[0]?.id;
        customerError = undefined;
        break;
      } catch (err) {
        customerError = err instanceof Error ? err.message : String(err);
        console.error('Customer create attempt failed; trying with fewer contacts:', err);
      }
    }
  }

  // 2. Vehicle — created with `customerId` so this customer becomes the OWNER (that's
  //    how Shopmonkey shows it under the customer; vehicles have owners, not a
  //    customerId field). Shopmonkey VIN-decodes it (submodel/engine/transmission/etc).
  //    We deliberately do NOT reuse a vehicle by VIN: a VIN match can belong to a
  //    different customer, which would attach their car and leave this customer's
  //    record empty. `size` is required.
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
    req.preferredTime ? `Requested time: ${req.preferredTime}` : '',
    vehicleLine ? `Vehicle: ${vehicleLine}` : '',
    req.message ? req.message : '',
    contact ? `Contact: ${contact}` : '',
    matchedExisting ? '(Linked to existing customer.)' : '',
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
    if (customerId) okBits.push(matchedExisting ? 'existing customer' : 'new customer'); else failBits.push('customer');
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
