import { Suspense, type ReactNode } from 'react'

// Validation level is 'experimental-manual-error' (set in next.config.ts).
// No implicit validation — only segments that explicitly opt in via
// `unstable_instant` are validated. When validated, the level is error,
// applying in dev AND build (build fails on violations).
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
