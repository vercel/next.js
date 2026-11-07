import { Suspense } from 'react'

type Params = { id: string }

// Opts into Partial Prefetching. Under App Shells, a partial (non-Full)
// prefetch of this route relies on the shared app shell and skips the per-link
// Speculative prefetch — so the param-specific content below is NOT prefetched.
export const prefetch = 'partial'

export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* The fallback is the param-independent app shell. */}
      <Suspense fallback={<p id="shell">Partial app shell</p>}>
        <ParamContent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamContent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="param-value">{`Partial post ${id}`}</p>
}
