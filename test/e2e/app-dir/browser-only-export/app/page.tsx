import { Suspense } from 'react'
import { BrowserOnlyContent } from './browser-only-content'

export default function Page() {
  return (
    <main>
      <p id="server-sibling">static server sibling</p>
      <Suspense fallback={<p id="fallback">static fallback</p>}>
        <BrowserOnlyContent />
      </Suspense>
    </main>
  )
}
