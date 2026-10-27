'use client'

import { useState } from 'react'

const deployments = [
  { name: 'Dashboard', status: 'Ready' },
  { name: 'Docs', status: 'Building' },
  { name: 'Marketing', status: 'Ready' },
] as const

export function DeploymentFeed() {
  const [showBuilding, setShowBuilding] = useState(false)
  const [checkedAt] = useState<number | null>(Date.now())
  const visibleDeployments = showBuilding
    ? deployments.filter((deployment) => deployment.status === 'Building')
    : deployments

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
