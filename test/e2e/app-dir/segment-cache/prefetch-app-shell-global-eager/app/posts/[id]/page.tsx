import { Suspense } from 'react'

type Params = { id: string }

// No per-segment `unstable_prefetch`. The route's prefetch config comes from
// the global `partialPrefetching: 'unstable_eager'` in next.config, which makes
// it eager — so the App Shells skip does NOT apply.
export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p id="shell">App shell</p>}>
        <ParamContent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamContent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="param-value">{`Eager post ${id}`}</p>
}
