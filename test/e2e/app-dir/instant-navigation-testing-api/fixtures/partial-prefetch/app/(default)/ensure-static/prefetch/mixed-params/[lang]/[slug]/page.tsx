import { Suspense } from 'react'
import { connection } from 'next/server'

export const ensureStatic = 'prefetch'

export default function MixedParamsPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="mixed-params-title">Mixed Params Runtime Page</h1>
      <Suspense
        fallback={<div data-testid="mixed-slug-fallback">Loading slug...</div>}
      >
        <SlugContent params={params} />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="mixed-dynamic-fallback">Loading dynamic...</div>
        }
      >
        <DynamicContent />
      </Suspense>
    </div>
  )
}

async function SlugContent({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { slug } = await params

  return <div data-testid="mixed-slug-value">slug: {slug}</div>
}

async function DynamicContent() {
  await connection()

  return <div data-testid="mixed-dynamic-value">dynamic content</div>
}
