import { ReactNode, Suspense } from 'react'
import { DynamicMarker, Marker } from './marker'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {/* Minted in the static shell rather than in a runtime render. */}
        <Marker name="shell" />
        <Suspense fallback={<span>layout loading</span>}>
          <DynamicMarker name="layout" />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
