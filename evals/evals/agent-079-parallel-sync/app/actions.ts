'use server'

import { runVendorSync, type SyncResult } from '../lib/sync-core'

export async function syncInventory(): Promise<SyncResult> {
  return runVendorSync('inventory')
}

export async function syncPricing(): Promise<SyncResult> {
  return runVendorSync('pricing')
}
