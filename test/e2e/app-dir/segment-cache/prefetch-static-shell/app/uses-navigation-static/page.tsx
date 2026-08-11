import { Suspense } from 'react'
import { unstable_navigation as navigation } from 'next/cache'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="navigation-loading">Loading navigation...</p>}>
        <NavigationContent />
      </Suspense>
    </main>
  )
}

async function NavigationContent() {
  await navigation()
  return <p id="page-content">Fully static page content (with navigation())</p>
}
