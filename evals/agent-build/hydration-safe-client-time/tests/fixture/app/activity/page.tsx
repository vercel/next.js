import { ActivityClock } from './activity-clock'
import { DeploymentFeed } from './deployment-feed'

export const instant = true

export default function ActivityPage() {
  return (
    <main>
      <h1>Deployment activity</h1>
      <p data-testid="deployment-status">Production is healthy.</p>
      <ActivityClock />
      <DeploymentFeed />
    </main>
  )
}
