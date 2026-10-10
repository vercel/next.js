'use client'
import { fixtureName } from './vendor-fixtures'
import { useState } from 'react'
export default function Feedback({ prompt }) {
  const [sent, setSent] = useState(null)
  if (sent)
    return <p className="feedback feedback-done">Thanks for the feedback.</p>
  return (
    <div className="feedback">
      <span>{prompt}</span>
      <button type="button" onClick={() => setSent('up')} aria-label="Helpful">
        Yes
      </button>
      <button
        type="button"
        onClick={() => setSent('down')}
        aria-label="Not helpful"
      >
        No
      </button>
    </div>
  )
}

export const __layers = [fixtureName].length
