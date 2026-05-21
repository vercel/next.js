import { Suspense, type ReactNode } from 'react'

// Validation level is 'experimental-error' (set in next.config.ts).
// Bare page/default segments get implicit validation in dev AND build.
// Build fails when violations are found.
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
