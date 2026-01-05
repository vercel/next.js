import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  return (
    <main>
      <h1>Cookies Context Loss Test</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>
    </main>
  )
}

async function TestComponent() {
  const contextBefore = workUnitAsyncStorage.getStore()
  console.log(
    '[COOKIES] CONTEXT_BEFORE_AWAIT:',
    contextBefore?.type ?? 'undefined'
  )

  // Await cookies - triggers runtime stage delay
  const cookieStore = await cookies()

  const contextAfter = workUnitAsyncStorage.getStore()
  console.log(
    '[COOKIES] CONTEXT_AFTER_AWAIT:',
    contextAfter?.type ?? 'undefined'
  )

  if (contextAfter === undefined) {
    console.log('[COOKIES] CONTEXT_STATUS: LOST')
  } else {
    console.log('[COOKIES] CONTEXT_STATUS: PRESERVED')
  }

  const timestamp = Date.now()

  return (
    <div>
      <p id="result">Cookies count: {cookieStore.getAll().length}</p>
      <p>Timestamp: {timestamp}</p>
      <p>Context Before: {contextBefore?.type ?? 'undefined'}</p>
      <p>Context After: {contextAfter?.type ?? 'undefined'}</p>
    </div>
  )
}
