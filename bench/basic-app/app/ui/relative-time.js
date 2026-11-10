'use client'
// Receives real timestamps like API rows carry, with a server-provided
// reference time so the rendered label is stable.
export default function RelativeTime({ date, now }) {
  const minutesAgo = Math.max(
    1,
    Math.round((now.getTime() - date.getTime()) / 60000)
  )
  const label =
    minutesAgo < 60
      ? minutesAgo + 'm ago'
      : minutesAgo < 1440
        ? Math.floor(minutesAgo / 60) + 'h ago'
        : Math.floor(minutesAgo / 1440) + 'd ago'
  return (
    <time className="relative-time" dateTime={date.toISOString()}>
      {label}
    </time>
  )
}
