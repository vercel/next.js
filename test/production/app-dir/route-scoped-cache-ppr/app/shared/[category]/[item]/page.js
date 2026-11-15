import { Suspense } from 'react'
import { Content, Dynamic } from '../../../../lib/state'
export default function Page({ params }) {
  return (
    <>
      <h1 id="shell">shared-shell</h1>
      <Suspense fallback="loading">
        <Content route="ppr-shared" params={params} />
      </Suspense>
      <Suspense fallback="dynamic">
        <Dynamic />
      </Suspense>
    </>
  )
}
