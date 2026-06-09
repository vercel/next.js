import { Suspense } from 'react'

// Same shape as `ungenerated-params/[slug]` (no `generateStaticParams`), but
// this route opts into runtime prefetching. The prefetch therefore includes
// the resolved `slug`, so the param should be visible inside the instant
// scope instead of suspending.
export const unstable_instant: {
  unstable_samples: Array<{ params: { slug: string } }>
} = {
  unstable_samples: [{ params: { slug: 'anything' } }],
}
export const prefetch = 'allow-runtime'

export default function UngeneratedParamsRuntimePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="ungenerated-params-runtime-title">
        Ungenerated Params Runtime Page
      </h1>
      <Suspense
        fallback={
          <div data-testid="ungenerated-params-runtime-fallback">
            Loading params...
          </div>
        }
      >
        <ParamContent params={params} />
      </Suspense>
    </div>
  )
}

async function ParamContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <div data-testid="ungenerated-param-runtime-value">slug: {slug}</div>
}
