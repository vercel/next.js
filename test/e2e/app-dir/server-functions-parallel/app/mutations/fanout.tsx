'use client'

import { useState } from 'react'
import { mutate } from '../actions'
import { slowCache } from '../cache'

let seq = 0
const nonce = () => `${Date.now()}-${seq++}`

export function MutationFanout() {
  const [out, setOut] = useState<Record<string, string>>({})
  const set = (key: string, value: unknown) =>
    setOut((o) => ({ ...o, [key]: JSON.stringify(value) }))

  const fireMutations = async () => {
    set('mutations', await Promise.all([mutate('a'), mutate('b'), mutate('c')]))
  }

  // A cache read fired alongside a mutation must not wait behind it.
  const fireCacheVsMutation = async () => {
    const n = nonce()
    set(
      'cache-vs-mutation',
      await Promise.all([slowCache(`cm-cache-${n}`), mutate('cm')])
    )
  }

  return (
    <>
      <button data-testid="fire-mutations" onClick={fireMutations}>
        mutations
      </button>
      <button
        data-testid="fire-cache-vs-mutation"
        onClick={fireCacheVsMutation}
      >
        cache-vs-mutation
      </button>
      <pre data-testid="out-mutations">{out.mutations ?? ''}</pre>
      <pre data-testid="out-cache-vs-mutation">
        {out['cache-vs-mutation'] ?? ''}
      </pre>
    </>
  )
}
