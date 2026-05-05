'use client'

import { useState } from 'react'

export default function Page() {
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        id="load"
        onClick={async () => {
          setStatus('loading')
          try {
            const mod = await import('../dynamic/async')
            setStatus(mod.default())
          } catch (error) {
            setStatus(
              error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error)
            )
          }
        }}
      >
        Load
      </button>
      <p id="status">{status}</p>
    </>
  )
}
