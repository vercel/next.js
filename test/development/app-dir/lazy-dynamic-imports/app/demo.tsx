'use client'

import { useState } from 'react'
import { sharedValue } from './shared'

export function Demo() {
  const [Target, setTarget] = useState<React.ComponentType | null>(null)
  const [overlapResult, setOverlapResult] = useState('overlap idle')

  return (
    <>
      <p id="eager">eager-marker-7c2a</p>
      <p id="eager-shared">{sharedValue}</p>
      <button
        id="load-overlap"
        onClick={async () => {
          const mod = await import('./shared')
          setOverlapResult(mod.sharedValue)
        }}
      >
        load 100% overlap
      </button>
      <p id="overlap-result">{overlapResult}</p>
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
