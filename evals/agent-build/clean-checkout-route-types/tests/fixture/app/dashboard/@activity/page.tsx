import { recentActivity } from '@/lib/projects'

export default function ActivitySlot() {
  return (
    <ul data-slot="activity">
      {recentActivity.map((event) => (
        <li key={event.id}>
          <strong>{event.project}</strong>: {event.message}
        </li>
      ))}
    </ul>
  )
}
