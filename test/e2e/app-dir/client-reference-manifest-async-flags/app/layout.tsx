import type { ReactNode } from 'react'
import { LayoutMarker } from './layout-marker'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <LayoutMarker />
        {children}
      </body>
    </html>
  )
}
