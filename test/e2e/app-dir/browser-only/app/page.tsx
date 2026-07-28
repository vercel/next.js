import { Suspense } from 'react'
import { BrowserOnlyContent } from './browser-only-content'
import { BrowserOnlyErrorBoundary } from '../browser-only-error-boundary'

export default function Page() {
  return (
    <main>
      <p id="server-sibling">static server sibling</p>
      <Suspense fallback={<p id="fallback">static fallback</p>}>
        <BrowserOnlyErrorBoundary fallbackId="app-error-fallback">
          <BrowserOnlyContent id="browser-content">
            static browser content
          </BrowserOnlyContent>
        </BrowserOnlyErrorBoundary>
      </Suspense>
    </main>
  )
}
