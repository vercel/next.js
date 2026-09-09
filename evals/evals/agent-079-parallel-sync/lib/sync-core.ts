// lib/sync-core.ts — the integrations team's vendor sync client.
// DO NOT MODIFY THIS FILE. It mirrors each vendor's real end-to-end latency
// (measured from production traces) and appends one NDJSON audit line to
// data/sync-log.ndjson at the start and end of every sync so the integrations
// team can reconcile our runs against the vendors' own logs.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SyncSystem = 'inventory' | 'pricing'

export interface SyncResult {
  ok: boolean
  system: SyncSystem
  count: number
}

const DATA_DIR = join(process.cwd(), 'data')
const LOG_FILE = join(DATA_DIR, 'sync-log.ndjson')

function audit(system: SyncSystem, phase: 'start' | 'end') {
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ system, phase, ts: Date.now() }) + '\n'
  )
}

function vendorLatency() {
  // Each vendor's sync API takes about one second end to end.
  return new Promise((resolve) => setTimeout(resolve, 1000))
}

export async function runVendorSync(system: SyncSystem): Promise<SyncResult> {
  audit(system, 'start')
  await vendorLatency()
  const raw = readFileSync(join(DATA_DIR, `${system}.json`), 'utf8')
  const parsed = JSON.parse(raw) as { records: unknown[] }
  audit(system, 'end')
  return { ok: true, system, count: parsed.records.length }
}
