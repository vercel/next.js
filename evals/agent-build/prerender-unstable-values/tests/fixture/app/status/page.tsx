import { RelativeTime } from '@/components/relative-time'
import { getIncidents } from '@/lib/incidents'

export default async function StatusPage() {
  const incidents = await getIncidents()
  const checkedAt = new Date()

  return (
    <main>
      <h1>System status</h1>
      <p data-testid="checked-at">
        Checked at{' '}
        <time dateTime={checkedAt.toISOString()}>
          {checkedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC
        </time>
      </p>
      <ul>
        {incidents.map((incident) => (
          <li key={incident.id} data-status={incident.status}>
            <strong>{incident.service}</strong>: {incident.title} · started{' '}
            <RelativeTime since={incident.startedAt} />
          </li>
        ))}
      </ul>
    </main>
  )
}
