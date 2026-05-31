'use client'

import { useActionState, useState } from 'react'
import { slowRead, type Span } from '../actions'

let seq = 0
const nonce = () => `${Date.now()}-${seq++}`

export function OptOut() {
  // useActionState runs its dispatches one after another (React chains them at
  // the hook level). This is the opt-out for sequential behavior, flag or not.
  const [uasLog, dispatch] = useActionState<Span[], string>(
    async (prev, label) => [...prev, await slowRead(label)],
    []
  )

  const [awaitLog, setAwaitLog] = useState('')

  const fireUAS = () => {
    const n = nonce()
    dispatch(`u1-${n}`)
    dispatch(`u2-${n}`)
    dispatch(`u3-${n}`)
  }

  const fireAwait = async () => {
    const n = nonce()
    const a = await slowRead(`a1-${n}`)
    const b = await slowRead(`a2-${n}`)
    const c = await slowRead(`a3-${n}`)
    setAwaitLog(JSON.stringify([a, b, c]))
  }

  return (
    <main>
      <button data-testid="fire-uas" onClick={fireUAS}>
        useActionState
      </button>
      <button data-testid="fire-await" onClick={fireAwait}>
        await
      </button>
      <pre data-testid="out-uas">{JSON.stringify(uasLog)}</pre>
      <pre data-testid="out-await">{awaitLog}</pre>
    </main>
  )
}
