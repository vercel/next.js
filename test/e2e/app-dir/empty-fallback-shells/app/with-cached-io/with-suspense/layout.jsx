'use cache'

import { Suspense } from 'react'
import { getSentinelValue } from '../sentinel'

export default async function Layout({ children }) {
  return (
    <html>
      <body>
        <div data-testid={`layout-${getSentinelValue()}`}>
          Layout: {new Date().toISOString()}
        </div>
        <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
