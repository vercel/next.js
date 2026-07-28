import { Suspense } from 'react'
import { BrowserOnlyContent } from './browser-only-content'

export const runtime = 'edge'

export default function Page() {
  return (
    <Suspense fallback={<p id="edge-fallback">edge fallback</p>}>
      <BrowserOnlyContent />
    </Suspense>
  )
}
