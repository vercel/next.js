import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
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
        This page passes cookies to a public cache, and uses some uncached IO,
        so parts of it should be prefetchable with a runtime prefetch.
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
  await cookies() // Guard from being statically prerendered, which would make the cache hang

  // We've already awaited cookies, but we still want to make sure
  // that the cache doesn't consider them a hanging promise
  const cookieValue = await publicCache(
    cookies().then(
      (cookieStore) => cookieStore.get('testCookie')?.value ?? null
    )
  )
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="cookie-value">{`Cookie: ${cookieValue}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function publicCache(cookiePromise: Promise<string | null>) {
  'use cache'
  const cookieValue = await cookiePromise
  await cachedDelay([__filename, cookieValue])
  return cookieValue
}

async function Dynamic() {
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
