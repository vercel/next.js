'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function DeployActions({ promoteIcon, rollbackIcon }) {
  const [confirming, setConfirming] = useState(null)
  return confirming ? (
    <span className="deploy-actions text-xs">
      Confirm {confirming}?
      <button type="button" onClick={() => setConfirming(null)}>
        Yes
      </button>
      <button type="button" onClick={() => setConfirming(null)}>
        No
      </button>
    </span>
  ) : (
    <span className="deploy-actions">
      <button
        type="button"
        aria-label="Promote"
        onClick={() => setConfirming('promote')}
      >
        {promoteIcon}
      </button>
      <button
        type="button"
        aria-label="Rollback"
        onClick={() => setConfirming('rollback')}
      >
        {rollbackIcon}
      </button>
    </span>
  )
}
export const __vendor = typeof describeBulkGraph
