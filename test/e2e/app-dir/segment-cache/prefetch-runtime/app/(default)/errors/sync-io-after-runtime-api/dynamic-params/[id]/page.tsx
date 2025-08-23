import { Suspense } from 'react'
import { DebugRenderKind } from '../../../../../shared'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

type Params = { id: string }

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
  const res = await params
  console.log(
    'RuntimePrefetchable :: awaited params',
    res,
    workUnitAsyncStorage.getStore()
  )
  return <div id="timestamp">Timestamp: {Date.now()}</div>
}
