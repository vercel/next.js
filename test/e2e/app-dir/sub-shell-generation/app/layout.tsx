'use cache'

import { ReactNode, Suspense } from 'react'
import { getSentinelValue } from './sentinel'

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div id="root-layout">Root Layout: ({getSentinelValue()})</div>
        <Suspense fallback={<p id="loading">Loading...</p>}>
          {children}
        </Suspense>
      </body>
    </html>
  )
}
