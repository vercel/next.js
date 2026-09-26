import { Suspense } from 'react'
import { BrowserOnly } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <BrowserOnly />
      </Suspense>
    </main>
  )
}
