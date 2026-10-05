import { Suspense } from 'react'
import { Content, Dynamic } from '../../../../lib/state'
export function generateStaticParams() {
  return [{ item: 'known' }, { item: 'seed-cold' }, { item: 'seed-warm' }]
}
export default function Page({ params }) {
  return (
    <>
      <h1 id="shell">catalog-shell</h1>
      <Suspense fallback="loading">
        <Content route="ppr-catalog" params={params} />
      </Suspense>
      <Suspense fallback="dynamic">
        <Dynamic />
      </Suspense>
    </>
  )
}
