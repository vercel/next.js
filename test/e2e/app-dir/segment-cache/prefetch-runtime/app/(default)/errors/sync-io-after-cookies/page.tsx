import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page performs sync IO after a cookies() call, so we should only see
        the error in a runtime prefetch or a navigation (and not during
        prerendering / prefetching)
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <One />
      </Suspense>
    </main>
  )
}

async function One() {
  const cookieStore = await cookies()
  await cachedDelay(500, ['/cookies', cookieStore.get('user-agent')?.value])
  return <div id="timestamp">Timestamp: {Date.now()}</div>
}
