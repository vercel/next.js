import { ActivityClock } from './activity-clock'

export const instant = true

export default function ActivityPage() {
  return (
    <main>
      <h1>Deployment activity</h1>
      <p data-testid="deployment-status">Production is healthy.</p>
      <ActivityClock />
    </main>
  )
}
