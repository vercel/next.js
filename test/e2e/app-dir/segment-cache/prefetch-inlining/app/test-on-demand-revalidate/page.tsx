import { cacheLife } from 'next/cache'

async function CachedValue() {
  'use cache'
  cacheLife({ stale: 120 })

  return <p id="page-on-demand-revalidate-value">{Math.random()}</p>
}

export default function OnDemandRevalidatePage() {
  return (
    <>
      <p id="page-on-demand-revalidate">On-demand revalidate page</p>
      <CachedValue />
    </>
  )
}
