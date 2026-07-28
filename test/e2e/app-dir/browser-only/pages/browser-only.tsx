import { Suspense, use, type ReactNode } from 'react'
import { browserOnly } from 'next/navigation'
import { BrowserOnlyErrorBoundary } from '../browser-only-error-boundary'

function BrowserContent({ children, id }: { children: ReactNode; id: string }) {
  use(browserOnly())
  return <p id={id}>{children}</p>
}

export default function Page() {
  return (
    <main>
      <p id="pages-server-sibling">pages server sibling</p>
      <Suspense fallback={<p id="pages-fallback">pages fallback</p>}>
        <BrowserOnlyErrorBoundary fallbackId="pages-error-fallback">
          <BrowserContent id="pages-browser-content">
            pages browser content
          </BrowserContent>
        </BrowserOnlyErrorBoundary>
      </Suspense>
      <Suspense
        fallback={<p id="pages-second-fallback">pages second fallback</p>}
      >
        <BrowserContent id="pages-second-browser-content">
          pages second browser content
        </BrowserContent>
      </Suspense>
    </main>
  )
}
