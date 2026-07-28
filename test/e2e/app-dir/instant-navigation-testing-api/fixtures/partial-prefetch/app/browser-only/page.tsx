import { Suspense } from 'react'
import { BrowserOnlyContent } from './browser-only-content'

export default function Page() {
  return (
    <Suspense
      fallback={
        <p data-testid="browser-only-fallback">browser-only fallback</p>
      }
    >
      <BrowserOnlyContent />
    </Suspense>
  )
}
