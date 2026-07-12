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
import { edgeGet, edgeSet } from '~/lib/edge-config';

export const prerender = false;

const CRON_SECRET = import.meta.env.CRON_SECRET?.toString() ?? '';
const WINDOW_DAYS = 120;
const STATUS_KEY = 'wcSyncLastRun'; // heartbeat: {at, leads, named, matched, updated}

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

  // Heartbeat view: last-run status so you can confirm the nightly cron is alive.
  if (url.searchParams.get('status') === '1') {
    const last = await edgeGet(STATUS_KEY);
    return new Response(JSON.stringify({ lastRun: last ?? null }, null, 2), { headers: { 'content-type': 'application/json' } });
  }

  if (!whatconvertsConfigured || !shopmonkeyConfigured) {
    return new Response(JSON.stringify({ error: 'WhatConverts or Shopmonkey not configured.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  const dry = url.searchParams.get('dry') === '1';
  const leads = await listGcsLeads(WINDOW_DAYS);

  const results: any[] = [];
  let named = 0;
  for (const lead of leads) {
    const { firstName, lastName } = splitName(lead.name);
    // Speed: a lead with no name (most phone calls) can't be matched to a Shopmonkey
    // customer (the API only looks up by name), so skip the lookups entirely.
    if (!lead.name.trim() || (!lead.email && !lead.phone)) {
      results.push({ lead: lead.lead_id, matched: false, reason: 'no name / no email+phone' });
      continue;
    }
    named++;

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

  const matched = results.filter((r) => r.matched).length;
  const updated = results.filter((r) => r.updated === true).length;

  // Heartbeat: record this run so /api/cron/whatconverts-sync?status=1&key=… shows it ran.
  if (!dry) {
    await edgeSet(STATUS_KEY, { at: new Date().toISOString(), leads: leads.length, named, matched, updated });
  }
  console.log(`[wc-sync] dry=${dry} leads=${leads.length} named=${named} matched=${matched} updated=${updated}`);

  const summary = { dry, window_days: WINDOW_DAYS, leads: leads.length, named, matched, updated, results };
  return new Response(JSON.stringify(summary, null, 2), { headers: { 'content-type': 'application/json' } });
};
