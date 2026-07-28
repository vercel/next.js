import { connection } from 'next/server'
import { Suspense } from 'react'
import { BrowserOnlyContent } from '../browser-only-content'

export default function Page() {
  return (
    <Suspense
      fallback={<p id="dynamic-shell-fallback">dynamic shell fallback</p>}
    >
      <DynamicContent />
    </Suspense>
  )
}

async function DynamicContent() {
  await connection()

  return (
    <main>
      <p id="dynamic-server-sibling">dynamic server sibling</p>
      <Suspense fallback={<p id="dynamic-fallback">dynamic fallback</p>}>
        <BrowserOnlyContent id="dynamic-browser-content">
          dynamic browser content
        </BrowserOnlyContent>
      </Suspense>
    </main>
  )
}
