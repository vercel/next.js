'use client'

import { useEffect, useState } from 'react'

// The figure is fetched from /api/kpi on hydration and rendered client-side.
// Server render + curl see only the initial `Loading…` state. The value is not
// in this bundle (only the endpoint path is). A real browser fetches /api/kpi
// (which serves the number only to browsers) and renders the result — so only a
// rendered browser observes the figure.
export function Revenue() {
  const [value, setValue] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/kpi')
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d.revenue === 'number') {
          setValue('$' + d.revenue.toLocaleString('en-US'))
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return <span data-testid="revenue">{value ?? 'Loading…'}</span>
}
