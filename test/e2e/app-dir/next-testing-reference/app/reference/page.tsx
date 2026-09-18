import { Suspense } from 'react'
import { ReferenceSubject } from './subject'

export default function Page() {
  return (
    <main>
      <h1>Reference shell</h1>
      <Suspense fallback={<p id="loading">Loading reference</p>}>
        <ReferenceSubject />
      </Suspense>
    </main>
  )
}
