'use client'

import { useState } from 'react'

export function UntouchedDemo() {
  const [Target, setTarget] = useState<React.ComponentType | null>(null)

  return (
    <>
      <button
        id="load-untouched"
        onClick={async () => {
          const mod = await import('./untouched-target')
          setTarget(() => mod.UntouchedTarget)
        }}
      >
        load untouched
      </button>
      {Target ? <Target /> : <p id="untouched-idle">untouched idle</p>}
    </>
  )
}
