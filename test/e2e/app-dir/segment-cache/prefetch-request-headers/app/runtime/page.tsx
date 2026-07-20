import { Suspense } from 'react'
import { cookies } from 'next/headers'

// Opts into runtime prefetching. This page is targeted by a
// <Link prefetch={true}>: because the route opted into Partial Prefetching,
// the full prefetch is performed with the Cache Components strategy, and the
// dynamic parts of the page are prefetched with a runtime request during the
// Speculative phase.
export const prefetch = 'allow-runtime'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="runtime-shell">Runtime app shell</p>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="runtime-dynamic">{`Runtime dynamic content: ${cookieValue}`}</p>
}
