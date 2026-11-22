import type { ReactNode } from 'react'

// Set on the root layout, so the page inherits it.
export const experimental_nativeRscRuntime = true

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
