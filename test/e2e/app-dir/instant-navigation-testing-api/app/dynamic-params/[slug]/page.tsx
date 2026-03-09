import { Suspense } from 'react'

export default function DynamicParamsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="dynamic-params-title">Dynamic Params Page</h1>
      <Suspense
        fallback={<div data-testid="params-fallback">Loading params...</div>}
      >
        <ParamContent params={params} />
      </Suspense>
    </div>
  )
}

async function ParamContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <div data-testid="param-value">slug: {slug}</div>
}
