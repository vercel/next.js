'use client'

import { useState, useTransition } from 'react'
import { saveDraft } from '../items/[id]/edit/actions'

export default function Page() {
  const [result, setResult] = useState('idle')
  const [isPending, startTransition] = useTransition()
  return (
    <button
      id="call"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const res = await saveDraft('1', 'hello')
          setResult(res.ok ? 'ok' : 'bad')
        })
      }}
    >
      {result}
    </button>
  )
}
