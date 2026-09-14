'use client'

import Link from 'next/link'

export default function EventRuntimeErrorPage() {
  return (
    <main>
      <button
        id="event-error"
        onClick={() => {
          throw new Error('Test event runtime error')
        }}
      >
        Trigger event error
      </button>
      <p id="event-page-content">Page remains rendered</p>
      <Link id="event-navigation" href="/">
        Navigate
      </Link>
    </main>
  )
}
