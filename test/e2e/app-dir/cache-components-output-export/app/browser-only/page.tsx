import { Suspense } from 'react'
import { BrowserOnly } from './client'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading browser content...</p>}>
      <BrowserOnly />
    </Suspense>
  )
}
