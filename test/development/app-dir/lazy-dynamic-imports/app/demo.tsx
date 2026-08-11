'use client'

import { useState } from 'react'

export function Demo() {
  const [Target, setTarget] = useState<React.ComponentType | null>(null)

  return (
    <>
      <p id="eager">eager-marker-7c2a</p>
      <button
        id="load"
        onClick={async () => {
          const mod = await import('./target')
          setTarget(() => mod.Target)
        }}
      >
        load
      </button>
      {Target ? <Target /> : <p id="idle">idle</p>}
    </>
  )
}
