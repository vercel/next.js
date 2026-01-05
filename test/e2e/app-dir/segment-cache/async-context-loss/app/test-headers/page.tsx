import { Suspense } from 'react'
import { headers } from 'next/headers'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  return (
    <main>
      <h1>Headers Context Loss Test</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>
    </main>
  )
}

async function TestComponent() {
  const contextBefore = workUnitAsyncStorage.getStore()
  console.log(
    '[HEADERS] CONTEXT_BEFORE_AWAIT:',
    contextBefore?.type ?? 'undefined'
  )

  // Await headers - triggers runtime stage delay
  const headerStore = await headers()

  const contextAfter = workUnitAsyncStorage.getStore()
  console.log(
    '[HEADERS] CONTEXT_AFTER_AWAIT:',
    contextAfter?.type ?? 'undefined'
  )

  if (contextAfter === undefined) {
    console.log('[HEADERS] CONTEXT_STATUS: LOST')
  } else {
    console.log('[HEADERS] CONTEXT_STATUS: PRESERVED')
  }

  const timestamp = Date.now()

  return (
    <div>
      <p id="result">
        User-Agent: {headerStore.get('user-agent')?.slice(0, 20)}...
      </p>
      <p>Timestamp: {timestamp}</p>
      <p>Context Before: {contextBefore?.type ?? 'undefined'}</p>
      <p>Context After: {contextAfter?.type ?? 'undefined'}</p>
    </div>
  )
}
