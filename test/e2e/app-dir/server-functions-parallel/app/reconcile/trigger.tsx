'use client'

import { useState } from 'react'
import {
  resetReconcile,
  reconcileOne,
  reconcileTwo,
  reconcileThree,
} from '../actions'

export function ReconcileTrigger() {
  const [out, setOut] = useState('')

  // Reset, then fire three writing actions at once. They overlap, and the one
  // writing 3 finishes last, so the final value settles on 3.
  const onFire = async () => {
    await resetReconcile()
    const results = await Promise.all([
      reconcileOne(),
      reconcileTwo(),
      reconcileThree(),
    ])
    setOut(JSON.stringify(results))
  }

  return (
    <>
      <button data-testid="fire-reconcile" onClick={onFire}>
        reconcile
      </button>
      <pre data-testid="out-reconcile">{out}</pre>
    </>
  )
}
