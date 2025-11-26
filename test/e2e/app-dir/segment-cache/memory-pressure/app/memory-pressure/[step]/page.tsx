import { Suspense } from 'react'

type Params = { step: string }

async function Content({ params }: { params: Promise<Params> }) {
  const { step } = await params
  return (
    <div id="memory-pressure-step-page">
      <h1>{`Page ${step}.`}</h1>
      {/* Render a large string such that a prefetch of this segment is roughly
          1MB over the network */}
      <p>{'a'.repeat(1024 * 1024)}</p>
    </div>
  )
}

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback="Loading...">
      <Content params={params} />
    </Suspense>
  )
}

export async function generateStaticParams(): Promise<Array<Params>> {
  // Generate some number of steps. This should be just enough to trigger the
  // default LRU limit used by the client prefetch cache.
  // TODO: Once we add a config option to set the prefetch limit, we can set a
  // smaller number, to speed up testing iteration (and CI).
  const result: Array<Params> = []
  for (let i = 0; i < 60; i++) {
    result.push({ step: i.toString() })
  }
  return result
}
