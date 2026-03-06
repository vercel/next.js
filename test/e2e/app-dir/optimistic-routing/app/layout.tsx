import { ReactNode, Suspense } from 'react'
import { RouterAct } from '@next/router-act/component'
import { RenderedRouteHistory } from '../components/rendered-route-history'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <RouterAct />
        <Suspense fallback={null}>
          <RenderedRouteHistory />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
