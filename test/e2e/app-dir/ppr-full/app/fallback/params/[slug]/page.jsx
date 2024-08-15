import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function Dynamic({ params = null }) {
  await setTimeout(1000)

  return (
    <div
      data-slug={
        Array.isArray(params.slug) ? params.slug.join('/') : params.slug
      }
    >
      {Array.isArray(params.slug) ? params.slug.join('/') : params.slug}
    </div>
  )
}

export default ({ params }) => {
  return (
    <Suspense fallback={<div data-fallback>Dynamic Loading...</div>}>
      <Dynamic params={params} />
    </Suspense>
  )
}
