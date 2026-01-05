import { Suspense } from 'react'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

type Params = { id: string }

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <h1>Params Context Loss Test</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent params={params} />
      </Suspense>
    </main>
  )
}

async function TestComponent({ params }: { params: Promise<Params> }) {
  const contextBefore = workUnitAsyncStorage.getStore()
  console.log(
    '[PARAMS] CONTEXT_BEFORE_AWAIT:',
    contextBefore?.type ?? 'undefined'
  )

  // Await params - this triggers delayUntilRuntimeStage
  // With the macrotask boundary fix, this will force context loss
  const resolvedParams = await params

  const contextAfter = workUnitAsyncStorage.getStore()
  console.log(
    '[PARAMS] CONTEXT_AFTER_AWAIT:',
    contextAfter?.type ?? 'undefined'
  )

  if (contextAfter === undefined) {
    console.log('[PARAMS] CONTEXT_STATUS: LOST')
  } else {
    console.log('[PARAMS] CONTEXT_STATUS: PRESERVED')
  }

  const timestamp = Date.now()

  return (
    <div>
      <p id="result">Param ID: {resolvedParams.id}</p>
      <p>Timestamp: {timestamp}</p>
      <p>Context Before: {contextBefore?.type ?? 'undefined'}</p>
      <p>Context After: {contextAfter?.type ?? 'undefined'}</p>
    </div>
  )
}
