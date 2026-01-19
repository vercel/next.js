// force-static should override the `headers()` usage

import { Suspense } from 'react'

// in parent layout
export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

function Dynamic({ params }) {
  return <p id="params">{JSON.stringify(params)}</p>
}

export default async function Page(props) {
  const params = await props.params
  return (
    <Suspense>
      <p id="page">/force-static/[slug]</p>
      <Dynamic params={params} />
      <p id="now">{Date.now()}</p>
    </Suspense>
  )
}
