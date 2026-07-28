import { Suspense } from 'react'
import { BrowserOnlyContent } from './client'

export const instant = { level: 'experimental-error' }

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>browser-only fallback</p>}>
        <BrowserOnlyContent />
      </Suspense>
      <p>This static sibling should remain available for instant validation</p>
    </main>
  )
}
