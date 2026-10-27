'use client'

import { useState } from 'react'

export function ActivityClock() {
  const [refreshes, setRefreshes] = useState(0)
  const [now] = useState<number | null>(Date.now())

  return (
    <section aria-label="Live activity controls">
      <p>
        Updated at{' '}
        {now === null ? (
          <span data-testid="clock-placeholder">
            Waiting for browser clock…
          </span>
        ) : (
          <time
            data-testid="live-time"
            data-timestamp={now}
            dateTime={new Date(now).toISOString()}
          >
            {new Date(now).toLocaleTimeString('en-US', {
              hour12: false,
            })}
          </time>
        )}
      </p>
      <button onClick={() => setRefreshes((count) => count + 1)}>
        Refresh view ({refreshes})
      </button>
    </section>
  )
}
