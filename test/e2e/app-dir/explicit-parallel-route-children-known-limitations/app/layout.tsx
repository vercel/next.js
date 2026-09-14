import type { ReactNode } from 'react'

// This layout intentionally has no `children` prop or ordinary route. The
// accompanying tests document renderer behavior that is still incorrectly
// coupled to a `children` branch.
export default function Root({ slot }: { slot: ReactNode }) {
  return (
    <html>
      <body>
        <main id="named-only-layout">
          <p>This root layout declares only the @slot parallel route.</p>
          {slot}
        </main>
      </body>
    </html>
  )
}
