#!/bin/bash
set -euo pipefail

cat > app/activity/activity-clock.tsx <<'EOF'
'use client'

import { useEffect, useState } from 'react'

export function ActivityClock() {
  const [refreshes, setRefreshes] = useState(0)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [])

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
EOF

npm run typecheck
