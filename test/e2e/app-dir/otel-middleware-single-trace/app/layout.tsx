import type { ReactNode } from 'react'
import { markMetadataGenerated } from '../metadata-ready'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

// Traced as `generateMetadata` spans in the render.
export async function generateMetadata() {
  markMetadataGenerated('layout')
  return {}
}
