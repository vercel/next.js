'use client'

import { useState, useTransition } from 'react'
import { itemActionRegistry } from '../../item-action-registry'

export default function ItemCaller() {
  const [status, setStatus] = useState('idle')
  const [isPending, startTransition] = useTransition()

  return (
    <button
      id="call-action"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const saveDraft = itemActionRegistry.saveDraft
          if (!saveDraft) {
            setStatus('missing')
            return
          }
          try {
            const result = await saveDraft('1', 'hello')
            setStatus(result.ok ? 'saved' : 'failed')
          } catch {
            setStatus('error')
          }
        })
      }}
    >
      {status}
    </button>
  )
}
