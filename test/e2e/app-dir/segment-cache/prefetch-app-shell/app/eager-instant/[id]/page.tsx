import { Suspense } from 'react'

type Params = { id: string }

// Combines both segment-level opt-ins: `unstable_instant` (which on its own
// behaves like 'partial' — not eager) AND `unstable_prefetch = 'unstable_eager'`.
// 'unstable_eager' wins: the segment is marked eager, so under App Shells the
// per-link Speculative prefetch still fires and the param-specific content
// below IS prefetched.
export const unstable_instant = true
export const unstable_prefetch = 'unstable_eager'

export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* The fallback is the param-independent app shell. */}
      <Suspense fallback={<p id="shell">Eager-instant app shell</p>}>
        <ParamContent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamContent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="param-value">{`Eager-instant post ${id}`}</p>
}
