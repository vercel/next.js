import { Suspense } from 'react'

// `id` is covered by `generateStaticParams` only for `x`, so `/mixed/en/x` is a
// fully prerendered route (both params resolve in the static shell) while other
// ids such as `123` are deferred to the runtime stage. The parent `[lang]`
// layout reads `lang`; this page reads only `id`.
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
