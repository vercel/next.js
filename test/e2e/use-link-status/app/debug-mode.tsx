'use client'

import { useSearchParams } from 'next/navigation'

export default function DebugMode() {
  const searchParams = useSearchParams()
  const debug = searchParams.get('debug')

  if (debug === '1') {
    return (
      <div data-testid="debug-mode">
        <h2>Debug Mode Enabled</h2>
      </div>
    )
  }

  return null
}
