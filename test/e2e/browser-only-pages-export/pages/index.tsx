import { Suspense, use } from 'react'
import { browserOnly } from 'next/navigation'

function BrowserOnlyContent() {
  use(browserOnly())
  return <p id="pages-browser-content">pages browser content</p>
}

export default function Page() {
  return (
    <main>
      <p id="pages-server-sibling">pages server sibling</p>
      <Suspense fallback={<p id="pages-fallback">pages fallback</p>}>
        <BrowserOnlyContent />
      </Suspense>
    </main>
  )
}
