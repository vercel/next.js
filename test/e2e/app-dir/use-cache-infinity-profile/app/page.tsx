import { cacheLife } from 'next/cache'

// With no Suspense boundary, the build fails if the "frozen" profile
// degrades into a dynamic cache life instead of staying prerenderable.
export default async function Page() {
  'use cache'
  cacheLife('frozen')

  return <p id="value">{crypto.randomUUID()}</p>
}
