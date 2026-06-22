import { Suspense } from 'react'

// `id` is never covered by `generateStaticParams`, so it is always deferred to
// the runtime stage. The parent `[lang]` layout reads `lang`; this page reads
// only `id`.
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
