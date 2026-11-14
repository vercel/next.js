import { Suspense } from 'react'
import { cookies } from 'next/headers'

export const ensureStatic = 'prefetch'

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
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
        fallback={<div data-testid="params-fallback">Loading params...</div>}
      >
        <ParamContent params={params} />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="runtime-fallback">Loading runtime content...</div>
        }
      >
        <RuntimeContent />
      </Suspense>
    </div>
  )
}

async function ParamContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <div data-testid="param-value">slug: {slug}</div>
}

async function RuntimeContent() {
  await cookies()
  return <div data-testid="runtime-content">Runtime content</div>
}
