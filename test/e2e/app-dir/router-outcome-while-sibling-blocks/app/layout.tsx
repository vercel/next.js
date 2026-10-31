import type { ReactNode } from 'react'

// The blocking layout intentionally has no Suspense boundary or loading.tsx
// above it.
export const instant = false

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
