import type { ReactNode } from 'react'

// This root intentionally declares only a named slot. The test documents that
// its generateViewport error has no outlet during the initial load.
export default function Root({ slot }: { slot: ReactNode }) {
  return (
    <html>
      <body>{slot}</body>
    </html>
  )
}
