import { Suspense } from 'react'

type Params = { id: string }

// Opts into Partial Prefetching in "eager" mode. Behaves like 'partial', but
// under App Shells it keeps prefetching the route's segments instead of relying
// on the shared app shell — so the param-specific content below IS prefetched.
export const unstable_prefetch = 'unstable_eager'

export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* The fallback is the param-independent app shell. */}
      <Suspense fallback={<p id="shell">Eager app shell</p>}>
        <ParamContent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamContent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="param-value">{`Eager post ${id}`}</p>
}
