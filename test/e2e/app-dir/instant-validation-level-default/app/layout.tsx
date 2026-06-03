import { Suspense, type ReactNode } from 'react'

// Validation level is not set in next.config.ts, so the framework default
// applies. The default is 'warning' — implicit validation fires on bare
// page/default segments in dev only (build is unaffected unless a segment
// explicitly escalates with `level: 'experimental-error'`).
//
// Children are wrapped in Suspense so that pages with runtime data
// accessed at the top of the page don't fail static-shell validation
// (the Suspense fallback renders into the static shell). Instant
// validation flags "Suspense too high for instant navigation" as an
// instant-specific violation when it runs.
export const unstable_instant = false

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>loading…</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
