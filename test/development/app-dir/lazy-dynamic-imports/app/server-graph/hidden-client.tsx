'use client'

import { useState } from 'react'

export function HiddenClient({ action }: { action: () => Promise<string> }) {
  const [hydrated, setHydrated] = useState(false)
  const [actionResult, setActionResult] = useState('action idle')

  return (
    <>
      <button id="hydrate-client" onClick={() => setHydrated(true)}>
        hydrate client
      </button>
      <p id="hydration-result">{hydrated ? 'hydrated' : 'not hydrated'}</p>
      <button
        id="run-hidden-action"
        onClick={async () => setActionResult(await action())}
      >
        run hidden action
      </button>
      <p id="hidden-action-result">{actionResult}</p>
    </>
  )
}
