import { Suspense } from 'react'

async function Content({ params }) {
  const { param } = await params
  return <div id="target-page-with-lazily-generated-param">Param: {param}</div>
}

export default async function Target({ params }) {
  return (
    <Suspense fallback="Loading...">
      <Content params={params} />
    </Suspense>
  )
}
