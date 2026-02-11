'use client'

import { useState } from 'react'

export function HydrationTest() {
  const [revealed, setRevealed] = useState(false)

  return (
    <>
      <button
        data-testid="hydration-test-button"
        onClick={() => setRevealed(true)}
      >
        Reveal
      </button>
      {revealed && (
        <div data-testid="hydration-test-revealed">
          Revealed after hydration
        </div>
      )}
    </>
  )
}
