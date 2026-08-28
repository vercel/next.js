'use client'

import { useState } from 'react'
import { syncInventory, syncPricing } from '../app/actions'
import type { SyncResult } from '../lib/sync-core'

export default function SyncPanel() {
  const [inventory, setInventory] = useState<SyncResult | null>(null)
  const [pricing, setPricing] = useState<SyncResult | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  async function handleSync() {
    setRunning(true)
    setInventory(null)
    setPricing(null)
    setElapsed(null)
    const t0 = performance.now()
    const inv = await syncInventory()
    const pri = await syncPricing()
    setInventory(inv)
    setPricing(pri)
    setElapsed(Math.round(performance.now() - t0))
    setRunning(false)
  }

  return (
    <section>
      <h2>Vendor sync</h2>
      <button data-testid="sync-button" disabled={running} onClick={handleSync}>
        {running ? 'Syncing…' : 'Sync now'}
      </button>
      {inventory && pricing ? (
        <p data-testid="sync-result">
          Inventory: {inventory.count} records · Pricing: {pricing.count}{' '}
          records
        </p>
      ) : null}
      {elapsed !== null ? (
        <p>
          Finished in <span data-testid="sync-elapsed">{elapsed}</span> ms
        </p>
      ) : null}
    </section>
  )
}
