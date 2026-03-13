import { Suspense } from 'react'
import AppRouteSuspendedContent from './suspended-content'

export default function AppRoutePage() {
  return (
    <main>
      <a href="/pages-route">Go to Pages Router</a>
      <Suspense fallback={<p id="app-fallback">loading app</p>}>
        <AppRouteSuspendedContent />
      </Suspense>
    </main>
  )
}
