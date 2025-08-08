import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { DebugRenderKind } from '../../../../shared'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page performs sync IO after a cookies() call, so we should only see
        the error in a runtime prefetch
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()
  return <div id="timestamp">Timestamp: {Date.now()}</div>
}
