'use cache'

import { Suspense } from 'react'
import { getSentinelValue } from '../sentinel'

export default async function Layout({ children }) {
  return (
    <html>
      <body>
        <div id="layout">
          Layout: {new Date().toISOString()} ({getSentinelValue()})
        </div>
        <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
