'use client'

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

function describe(elapsedMs: number): string {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(elapsedMs) >= size) {
      return formatter.format(-Math.round(elapsedMs / size), unit)
    }
  }
  return 'just now'
}

export function RelativeTime({ since }: { since: string }) {
  const elapsed = Date.now() - new Date(since).getTime()

  return (
    <time dateTime={since} data-testid="relative-time">
      {describe(elapsed)}
    </time>
  )
}
