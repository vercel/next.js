import { Suspense } from 'react'

// Intentionally no generateStaticParams — this exercises the fallback-shell
// path for a dynamic route whose URL is not covered by static params.
export default function UngeneratedParamsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <h1 data-testid="ungenerated-params-title">Ungenerated Params Page</h1>
      <Suspense
        fallback={
          <div data-testid="ungenerated-params-fallback">Loading params...</div>
        }
      >
        <ParamContent params={params} />
      </Suspense>
    </div>
  )
}

async function ParamContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <div data-testid="ungenerated-param-value">slug: {slug}</div>
}
