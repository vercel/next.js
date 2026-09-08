import { ReactNode } from 'react'
import { Marker } from './marker'

// Rendered per request, like any route that reads cookies() or headers(). A
// fully static prerender renders layout and page in a single Flight pass and
// does not expose the collision.
export const dynamic = 'force-dynamic'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Marker name="layout" />
        {children}
      </body>
    </html>
  )
}
