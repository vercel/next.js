import { Suspense } from 'react'
import { cookies } from 'next/headers'

// Opts into Partial Prefetching (`instant`), and into eager prefetching so
// the per-link Speculative prefetch fires for a default (auto) link.
export const instant = true
export const prefetch = 'unstable_eager'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="pp-shell">PP app shell</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="pp-dynamic">{`PP dynamic content: ${cookieValue}`}</p>
}
