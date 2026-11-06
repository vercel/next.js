'use client'

export default function Chart({
  onEvent,
}: {
  onEvent?: (event: string) => void
}) {
  return (
    <button onClick={() => onEvent?.('chart-click')}>
      dashboard-chart-marker
    </button>
  )
}
