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

cat > app/activity/deployment-feed.tsx <<'EOF'
'use client'

import { useEffect, useState } from 'react'

const deployments = [
  { name: 'Dashboard', status: 'Ready' },
  { name: 'Docs', status: 'Building' },
  { name: 'Marketing', status: 'Ready' },
] as const

export function DeploymentFeed() {
  const [showBuilding, setShowBuilding] = useState(false)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const visibleDeployments = showBuilding
    ? deployments.filter((deployment) => deployment.status === 'Building')
    : deployments

  useEffect(() => {
    const update = () => setCheckedAt(Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <section aria-label="Recent deployments">
      <h2>Recent deployments</h2>
      <p>
        Last checked{' '}
        {checkedAt === null ? (
          <span data-testid="feed-placeholder">
            Waiting for browser activity…
          </span>
        ) : (
          <time
            data-testid="feed-time"
            data-timestamp={checkedAt}
            dateTime={new Date(checkedAt).toISOString()}
          >
            {new Date(checkedAt).toLocaleTimeString('en-US', {
              hour12: false,
            })}
          </time>
        )}
      </p>
      <button onClick={() => setShowBuilding((value) => !value)}>
        {showBuilding ? 'Show all deployments' : 'Show building only'}
      </button>
      <ul>
        {visibleDeployments.map((deployment) => (
          <li key={deployment.name}>
            {deployment.name}: {deployment.status}
          </li>
        ))}
      </ul>
    </section>
  )
}
EOF

npm run typecheck
