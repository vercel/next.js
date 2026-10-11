import { Suspense } from 'react'

// Both params have generators, so the route has a fully generated shape. Novel
// values can complete an optional shell without deferring either param.
export function generateStaticParams() {
  return [{ id: 'x' }]
}

export default function MixedIdPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Waiting for id...</p>}>
        <IdLabel params={params} />
      </Suspense>
    </main>
  )
}

async function IdLabel({
  params,
}: {
  params: Promise<{ lang: string; id: string }>
}) {
  const { id } = await params
  console.log('after params - id')
  return <p>id: {id}</p>
}
