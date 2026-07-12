// src/lib/edge-config.ts
// Tiny Edge Config read/write. Reads go through the connection string (EDGE_CONFIG);
// writes go through the Vercel REST API (needs VERCEL_API_TOKEN). Used for the booking
// floor and the WhatConverts-sync heartbeat (last-run status).

const EDGE_CONFIG = import.meta.env.EDGE_CONFIG;
const VERCEL_API_TOKEN = import.meta.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = import.meta.env.VERCEL_TEAM_ID;

function ecId(): string | undefined {
  return String(EDGE_CONFIG || '').match(/(ecfg_[^/?]+)/)?.[1];
}
function ecToken(): string | undefined {
  return String(EDGE_CONFIG || '').match(/token=([^&\s]+)/)?.[1];
}

/** Read an Edge Config item. Returns undefined on any error / not found. */
export async function edgeGet<T = unknown>(key: string): Promise<T | undefined> {
  const id = ecId(), token = ecToken();
  if (!id || !token) return undefined;
  try {
    const res = await fetch(`https://edge-config.vercel.com/${id}/item/${key}?token=${token}`);
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

/** Upsert an Edge Config item via the Vercel API. Returns ok. Never throws. */
export async function edgeSet(key: string, value: unknown): Promise<boolean> {
  const id = ecId();
  if (!id || !VERCEL_API_TOKEN) return false;
  try {
    const url = `https://api.vercel.com/v1/edge-config/${id}/items${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${VERCEL_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ operation: 'upsert', key, value }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
