'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function BillingMeter({ spent, budget, icon }) {
  const [showBudget, setShowBudget] = useState(false)
  return (
    <button
      type="button"
      className="billing-meter text-xs"
      onClick={() => setShowBudget((s) => !s)}
    >
      {icon} {showBudget ? `$${spent} of $${budget}` : `$${spent} this period`}
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
