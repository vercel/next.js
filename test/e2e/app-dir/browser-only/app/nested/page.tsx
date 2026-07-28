import { Suspense } from 'react'
import { BrowserOnlyContent } from '../browser-only-content'

export default function Page() {
  return (
    <main>
      <p id="outer-server-sibling">outer server sibling</p>
      <Suspense fallback={<p id="outer-fallback">outer fallback</p>}>
        <p id="inner-server-sibling">inner server sibling</p>
        <Suspense fallback={<p id="inner-fallback">inner fallback</p>}>
          <BrowserOnlyContent id="nested-browser-content">
            nested browser content
          </BrowserOnlyContent>
        </Suspense>
      </Suspense>
    </main>
  )
}
