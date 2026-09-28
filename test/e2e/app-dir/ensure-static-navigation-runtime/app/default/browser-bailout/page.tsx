import { Suspense } from 'react'
import { Timestamp } from '../../../components/timestamp'
import { BrowserOnly } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Timestamp />
      <p>
        This page does not use any params, and should be fully static despite
        having content that bails out to browser-only rendering.
      </p>
      <Suspense
        fallback={
          <p id="browser-content-fallback">Fallback for browser-only content</p>
        }
      >
        <BrowserOnly />
      </Suspense>
    </main>
  )
}
