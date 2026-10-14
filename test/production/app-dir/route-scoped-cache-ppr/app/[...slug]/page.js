import { Suspense } from 'react'
import { Content, Dynamic } from '../../lib/state'
export function generateStaticParams() {
  return [{ slug: ['warmup'] }]
}
export default function Page({ params }) {
  return (
    <>
      <h1 id="shell">catchall-shell</h1>
      <Suspense fallback="loading">
        <Content route="ppr-catchall" params={params} />
      </Suspense>
      <Suspense fallback="dynamic">
        <Dynamic />
      </Suspense>
    </>
  )
}
