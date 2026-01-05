import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

// A simple promise that resolves after a microtask
// This demonstrates the issue is with React's scheduler, not specific to Next.js APIs
function createDelayedPromise<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve(value))
  })
}

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  return (
    <main>
      <h1>Generic Promise Context Loss Test</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>
    </main>
  )
}

async function TestComponent() {
  // First access cookies to make this a valid dynamic page
  const cookieStore = await cookies()

  const contextBefore = workUnitAsyncStorage.getStore()
  console.log(
    '[GENERIC] CONTEXT_BEFORE_AWAIT:',
    contextBefore?.type ?? 'undefined'
  )

  // Await a generic promise AFTER the runtime API
  const data = await createDelayedPromise({ message: 'Hello from promise' })

  const contextAfter = workUnitAsyncStorage.getStore()
  console.log(
    '[GENERIC] CONTEXT_AFTER_AWAIT:',
    contextAfter?.type ?? 'undefined'
  )

  if (contextAfter === undefined) {
    console.log('[GENERIC] CONTEXT_STATUS: LOST')
  } else {
    console.log('[GENERIC] CONTEXT_STATUS: PRESERVED')
  }

  // Now Date.now() is valid because we already accessed cookies
  const timestamp = Date.now()

  return (
    <div>
      <p id="result">Message: {data.message}</p>
      <p>Cookies: {cookieStore.getAll().length}</p>
      <p>Timestamp: {timestamp}</p>
      <p>Context Before: {contextBefore?.type ?? 'undefined'}</p>
      <p>Context After: {contextAfter?.type ?? 'undefined'}</p>
    </div>
  )
}
