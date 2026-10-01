import type { ReactNode } from 'react'

// Every route in this app blocks on its request-time data. There's
// intentionally no Suspense boundary or loading.tsx above any of the pages.
export const instant = false

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
