import { Suspense } from 'react'
import { cookies } from 'next/headers'

// No Partial Prefetching opt-ins. With a default (auto) link, the static
// parts of this page are prefetched with per-segment requests.
export default function Page() {
  return (
    <main>
      <p id="default-static">Default route static content</p>
      <Suspense fallback={<p>Loading...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? 'none'
  return <p id="default-dynamic">{`Default dynamic content: ${cookieValue}`}</p>
}
