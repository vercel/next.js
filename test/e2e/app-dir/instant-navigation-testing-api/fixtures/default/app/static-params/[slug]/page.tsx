import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'hello' }]
}

export default function StaticParamsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="static-params-title">Static Params Page</h1>
      <Suspense
        fallback={
          <div data-testid="static-params-fallback">Loading params...</div>
        }
      >
        <ParamContent params={params} />
      </Suspense>
    </div>
  )
}

async function ParamContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <div data-testid="static-param-value">slug: {slug}</div>
}
