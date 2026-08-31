import { unstable_navigation as navigation } from 'next/cache'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  await cookies() // Avoid static prerendering

  // `navigation()` should be a hanging input.
  const result = await cachedFn(navigation())
  return (
    <main>
      <h1>This page passes a prefetch() promise to a cache</h1>
      <p id="cached-data">{result}</p>

      <Suspense fallback="Loading dynamic data...">
        <DynamicData />
      </Suspense>
    </main>
  )
}

async function DynamicData() {
  await connection()
  return 'Dynamic data'
}

async function cachedFn(input: any) {
  'use cache'
  // Make sure the argument is not optimized away as unused
  if (Math.random() < 0) {
    console.log(input)
  }
  await new Promise((resolve) => setTimeout(resolve))
  return 'Cached data: ' + Date.now()
}
