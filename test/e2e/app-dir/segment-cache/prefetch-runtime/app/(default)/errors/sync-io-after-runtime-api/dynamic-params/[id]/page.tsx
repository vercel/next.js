import { Suspense } from 'react'
import { DebugRenderKind } from '../../../../../shared'

type Params = { id: string }

export const unstable_instant = {
  prefetch: 'runtime',
  // We're intentionally testing error behavior at runtime.
  // Build-time validation catches it and prevents that.
  unstable_disableValidation: true,
  samples: [{ cookies: [] }],
}
export const unstable_prefetch = 'runtime'

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page performs sync IO after awaiting params, so we should only see
        the error in a runtime prefetch
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable params={params} />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable({ params }: { params: Promise<Params> }) {
  await params
  return <div id="timestamp">Timestamp: {Date.now()}</div>
}
