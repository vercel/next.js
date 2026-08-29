// lib/pricing-core.ts — the pricing team's per-user pricing client.
// DO NOT MODIFY THIS FILE. It mirrors the pricing service's real end-to-end
// latency (measured from production traces) and appends one NDJSON line to
// data/pricing-log.ndjson for every pricing computation, so the pricing team
// can reconcile our traffic against their capacity dashboards.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheLife } from 'next/cache'

export interface DealPrice {
  dealId: string
  amount: string
}

const LOG_FILE = join(process.cwd(), 'data', 'pricing-log.ndjson')

function serviceLatency() {
  // One pricing computation takes about 800ms end to end.
  return new Promise((resolve) => setTimeout(resolve, 800))
}

export async function getUserPrice(dealId: string): Promise<DealPrice> {
  'use cache: private'
  cacheLife('minutes')
  appendFileSync(LOG_FILE, JSON.stringify({ dealId, ts: Date.now() }) + '\n')
  await serviceLatency()
  const n = Number.parseInt(dealId, 10) || 0
  const cents = 1900 + ((n * 137) % 6000)
  return { dealId, amount: `$${(cents / 100).toFixed(2)}` }
}
