// src/pages/api/cron/whatconverts-sync.ts
// Nightly closed-loop sync: for each recent WhatConverts lead (German Car Specialists
// profile), find the matching Shopmonkey customer (by name, confirmed via email/phone),
// sum the revenue they've PAID since the lead came in, and write that back as the lead's
// sales value in WhatConverts — so marketing ROI by source is real, not guessed.
//
// Triggered by Vercel Cron (see vercel.json). Auth: Vercel sends
// `Authorization: Bearer <CRON_SECRET>`; a `?key=<CRON_SECRET>` is also accepted for
// manual runs. `?dry=1` computes matches WITHOUT writing to WhatConverts.
//
// Attribution: revenue PAID on/after the lead date (true lead ROI, not lifetime).

import type { APIRoute } from 'astro';
import { listGcsLeads, setLeadSalesValue, whatconvertsConfigured } from '~/lib/whatconverts';
import { findExistingCustomer, getCustomerPaidCentsSince, shopmonkeyConfigured } from '~/lib/shopmonkey';

export const prerender = false;

const CRON_SECRET = import.meta.env.CRON_SECRET?.toString() ?? '';
const WINDOW_DAYS = 120;

function splitName(full = ''): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

export const GET: APIRoute = async ({ request, url }) => {
  // Auth — Vercel Cron header or an explicit ?key. Never run open.
  const bearer = request.headers.get('authorization') === `Bearer ${CRON_SECRET}`;
  const keyOk = url.searchParams.get('key') === CRON_SECRET;
  if (!CRON_SECRET || (!bearer && !keyOk)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  if (!whatconvertsConfigured || !shopmonkeyConfigured) {
    return new Response(JSON.stringify({ error: 'WhatConverts or Shopmonkey not configured.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  const dry = url.searchParams.get('dry') === '1';
  const leads = await listGcsLeads(WINDOW_DAYS);

  const results: any[] = [];
  for (const lead of leads) {
    const { firstName, lastName } = splitName(lead.name);
    if (!lead.email && !lead.phone) { results.push({ lead: lead.lead_id, matched: false, reason: 'no email/phone' }); continue; }

    const cust = await findExistingCustomer({ firstName, lastName, email: lead.email, phone: lead.phone });
    if (!cust) { results.push({ lead: lead.lead_id, name: lead.name, matched: false }); continue; }

    const cents = await getCustomerPaidCentsSince(cust.id, lead.date_created);
    const dollars = Math.round(cents) / 100;
    const current = lead.sales_value ?? 0;
    const willUpdate = dollars > 0 && dollars !== current;
    let updated = false;
    if (willUpdate && !dry) updated = await setLeadSalesValue(lead.lead_id, dollars);

    results.push({ lead: lead.lead_id, name: lead.name, matched: true, customerId: cust.id, current, sales: dollars, updated: dry ? `${willUpdate ? 'would-update' : 'no-change'} (dry)` : updated });
  }

  const summary = {
    dry,
    window_days: WINDOW_DAYS,
    leads: leads.length,
    matched: results.filter((r) => r.matched).length,
    updated: results.filter((r) => r.updated === true).length,
    results,
  };
  return new Response(JSON.stringify(summary, null, 2), { headers: { 'content-type': 'application/json' } });
};
