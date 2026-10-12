'use client'
import { useState } from 'react'

export default function Toaster({ position }) {
  const [toasts] = useState([])
  if (toasts.length === 0)
    return (
      <div
        className={'toaster ' + (position ?? 'bottom-right')}
        aria-live="polite"
      />
    )
  return (
    <div
      className={'toaster ' + (position ?? 'bottom-right')}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  )
}
