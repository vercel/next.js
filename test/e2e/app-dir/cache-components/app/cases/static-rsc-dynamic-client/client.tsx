'use client'

export function Time() {
  return (
    <p>
      The time is{' '}
      <span id="time" suppressHydrationWarning>
        {new Date().toISOString()}
      </span>
    </p>
  )
}
