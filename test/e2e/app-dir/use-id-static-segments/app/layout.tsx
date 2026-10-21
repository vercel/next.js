import { ReactNode } from 'react'
import { Marker } from './marker'

/**
 * Every route is fully static, so each URL's segments are numbered by a single
 * prerender pass. `bottom` mints its id *after* `children`, so the counter a
 * layout segment lands on depends on how many ids the page below it minted --
 * which is what lets a prefetched page segment from one URL collide with a
 * layout segment retained from another.
 */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Marker name="top" />
        {children}
        <Marker name="bottom" />
      </body>
    </html>
  )
}
