'use client'
const LABELS = {
  ready: 'Ready',
  building: 'Building',
  error: 'Error',
  queued: 'Queued',
}
export default function StatusBadge({ status }) {
  return (
    <span className={'status-badge status-' + status}>
      <span className="status-dot" aria-hidden="true" />
      {LABELS[status] ?? status}
    </span>
  )
}
