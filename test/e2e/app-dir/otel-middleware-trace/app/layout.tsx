import type { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

// Traced as `generateMetadata` spans in the render.
export async function generateMetadata() {
  return {}
}
