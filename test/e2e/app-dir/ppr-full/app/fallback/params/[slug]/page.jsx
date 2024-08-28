import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Dynamic({ params = null }) {
  await setTimeout(1000)

  return <div data-slug={params.slug}>{params.slug}</div>
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<div data-fallback>Dynamic Loading...</div>}>
      <Dynamic params={params} />
    </Suspense>
  )
}
