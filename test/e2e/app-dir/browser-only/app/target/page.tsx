import { Suspense } from 'react'
import { BrowserOnlyContent } from '../browser-only-content'

export default function Page() {
  return (
    <Suspense fallback={<p id="target-fallback">target fallback</p>}>
      <BrowserOnlyContent id="target-browser-content">
        target browser content
      </BrowserOnlyContent>
    </Suspense>
  )
}
