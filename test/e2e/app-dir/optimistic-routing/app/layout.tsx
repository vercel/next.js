import { ReactNode, Suspense } from 'react'
import { RenderedRouteHistory } from '../components/rendered-route-history'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <RenderedRouteHistory />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
