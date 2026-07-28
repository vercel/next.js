import { Suspense, use } from 'react'
import { browserOnly } from 'next/navigation'

function BrowserContent() {
  use(browserOnly())
  return <p id="pages-ssr-browser-content">pages SSR browser content</p>
}

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return (
    <main>
      <p id="pages-ssr-server-sibling">pages SSR server sibling</p>
      <Suspense fallback={<p id="pages-ssr-fallback">pages SSR fallback</p>}>
        <BrowserContent />
      </Suspense>
    </main>
  )
}
