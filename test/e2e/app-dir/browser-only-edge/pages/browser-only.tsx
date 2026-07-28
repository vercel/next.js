import { Suspense, use } from 'react'
import { browserOnly } from 'next/navigation'

function BrowserOnlyContent() {
  use(browserOnly())
  return <p id="pages-edge-browser-content">pages edge browser content</p>
}

export const config = {
  runtime: 'experimental-edge',
}

export default function Page() {
  return (
    <Suspense fallback={<p id="pages-edge-fallback">pages edge fallback</p>}>
      <BrowserOnlyContent />
    </Suspense>
  )
}
