import { Suspense } from 'react'
import { SyncIO } from './client'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <main>{children}</main>
        <p>
          In addition to `SyncIO` being rendered in the Page, we're also
          rendering it in the Layout.
        </p>
        <p>The page should still prerender without errors.</p>
        <Suspense fallback="">
          <SyncIO />
        </Suspense>
      </body>
    </html>
  )
}
