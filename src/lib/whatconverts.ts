// src/lib/whatconverts.ts
// Minimal WhatConverts Lead API client, SCOPED to the German Car Specialists account/
// profile. IMPORTANT: the API token is agency-wide (many accounts), so every call MUST
// pass account_id + profile_id — otherwise we'd read/write other clients' leads.
//
// Used by the nightly cron (src/pages/api/cron/whatconverts-sync.ts) to write the
// Shopmonkey sale value back onto matched leads (closed-loop ROI).
//
// Gotcha: the "edit a lead" endpoint ignores a JSON body — params must be
// form-encoded (verified against the live API).

const WC_BASE = 'https://app.whatconverts.com/api/v1';
const TOKEN = import.meta.env.WHATCONVERTS_TOKEN?.toString() ?? '';
const SECRET = import.meta.env.WHATCONVERTS_SECRET?.toString() ?? '';

// FAIL-SAFE: German Car Specialists' account/profile are HARD-CODED here and are the only
// values this module will ever read or write. The env vars may set them, but must MATCH —
// if the env is ever pointed at a different account/profile, the sync refuses to run
// (whatconvertsConfigured = false) rather than risk touching another agency client.
const GCS_ACCOUNT_ID = '99459';
const GCS_PROFILE_ID = '148045';
const ACCOUNT_ID = import.meta.env.WHATCONVERTS_ACCOUNT_ID?.toString() ?? GCS_ACCOUNT_ID;
const PROFILE_ID = import.meta.env.WHATCONVERTS_PROFILE_ID?.toString() ?? GCS_PROFILE_ID;

const scopeMatchesGcs = ACCOUNT_ID === GCS_ACCOUNT_ID && PROFILE_ID === GCS_PROFILE_ID;
if ((ACCOUNT_ID || PROFILE_ID) && !scopeMatchesGcs) {
  console.error(`WhatConverts: DISABLED — env account/profile (${ACCOUNT_ID}/${PROFILE_ID}) ≠ GCS (${GCS_ACCOUNT_ID}/${GCS_PROFILE_ID}). Refusing to run.`);
}

export const whatconvertsConfigured = Boolean(TOKEN && SECRET && scopeMatchesGcs);

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${TOKEN}:${SECRET}`).toString('base64');
}

export interface WcLead {
  lead_id: number;
  date_created: string;   // ISO, e.g. "2026-07-06T21:27:26Z"
  name: string;
  email: string;
  phone: string;
  sales_value: number | null;
  quote_value: number | null;
}

/** List GCS leads created within the last `days`. Paginates. Never throws → [] on error. */
export async function listGcsLeads(days = 120): Promise<WcLead[]> {
  if (!whatconvertsConfigured) return [];
  const out: WcLead[] = [];
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  for (let page = 1; page <= 25; page++) {
    let json: any;
    try {
      const url = `${WC_BASE}/leads?account_id=${GCS_ACCOUNT_ID}&profile_id=${GCS_PROFILE_ID}`
        + `&leads_per_page=100&page_number=${page}&start_date=${start}&end_date=${end}`;
      const res = await fetch(url, { headers: { Authorization: authHeader() } });
      if (!res.ok) break;
      json = await res.json();
    } catch {
      break;
    }
    const leads: any[] = Array.isArray(json?.leads) ? json.leads : [];
    for (const l of leads) {
      // HARD SCOPE GUARD: the token is agency-wide — never accept a lead that isn't
      // GCS's account+profile, even if the query param were ever ignored server-side.
      if (String(l.account_id) !== GCS_ACCOUNT_ID || String(l.profile_id) !== GCS_PROFILE_ID) continue;
      const af = l.additional_fields || {};
      out.push({
        lead_id: l.lead_id,
        date_created: l.date_created,
        name: (l.contact_name || af['Full name *'] || af['Full name'] || '').trim(),
        email: (l.contact_email_address || l.email_address || '').trim(),
        phone: (l.contact_phone_number || l.phone_number || '').trim(),
        sales_value: l.sales_value ?? null,
        quote_value: l.quote_value ?? null,
      });
    }
    if (!leads.length || page >= (json?.total_pages ?? 1)) break;
  }
  return out;
}

/** Fetch a single lead (with account_id/profile_id) to verify scope. Null on error. */
async function fetchLead(leadId: number): Promise<any | null> {
  try {
    const res = await fetch(`${WC_BASE}/leads/${leadId}`, { headers: { Authorization: authHeader() } });
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j?.leads) ? j.leads[0] : j;
  } catch {
    return null;
  }
}

/** Set a lead's sales + quote values (form-encoded; JSON is ignored by the API). Returns ok. */
export async function setLeadValues(leadId: number, salesValue: number, quoteValue: number): Promise<boolean> {
  if (!whatconvertsConfigured) return false;
  // HARD WRITE GUARD: re-verify the lead belongs to the GCS account+profile before ANY
  // write. The token can reach 17 accounts; this makes it impossible to write elsewhere.
  const lead = await fetchLead(leadId);
  if (!lead || String(lead.account_id) !== GCS_ACCOUNT_ID || String(lead.profile_id) !== GCS_PROFILE_ID) {
    console.error(`WhatConverts: REFUSING to update lead ${leadId} — not in GCS account/profile.`);
    return false;
  }
  try {
    const body = new URLSearchParams({ sales_value: String(salesValue), quote_value: String(quoteValue), quotable: 'yes' });
    const res = await fetch(`${WC_BASE}/leads/${leadId}`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
