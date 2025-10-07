import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../shared'
import { connection } from 'next/server'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [{ name: 'testCookie', value: 'testValue' }] }],
}

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page uses cookies (from inside a private cache) and some uncached
        IO, so parts of it should be runtime-prefetchable.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
      <form
        action={async (formData: FormData) => {
          'use server'
          const cookieStore = await cookies()
          const cookieValue = formData.get('cookie') as string | null
          if (cookieValue) {
            cookieStore.set('testCookie', cookieValue)
          }
        }}
      >
        <input type="text" name="cookie" />
        <button type="submit">Update cookie</button>
      </form>
    </main>
  )
}

async function RuntimePrefetchable() {
  const cookieValue = await privateCache()
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="cookie-value">{`Cookie: ${cookieValue}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function privateCache() {
  'use cache: private'
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  await cachedDelay([__filename, cookieValue])
  return cookieValue
}

async function Dynamic() {
  await uncachedIO()
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
