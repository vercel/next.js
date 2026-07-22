import { cacheLife } from 'next/cache'
import { cookies } from 'next/headers'

export const prefetch = 'allow-runtime'

// The page has no meaningful static shell: everything the user sees comes
// from a private cache scope that reads request data, so only a runtime
// prefetch can deliver it ahead of a navigation. The static PPR prerender of
// this route contains the loading.tsx fallback instead.
async function Composer() {
  'use cache: private'
  cacheLife({ stale: 300 })
  const cookieStore = await cookies()
  const flavor = cookieStore.get('flavor')?.value ?? 'none'
  // Fresh entropy per cache fill, mirroring a draft id (v0's createId). A
  // cookie value can be vary-param substituted by the client from a
  // prerendered runtime-stage sample; entropy cannot. Serving it requires
  // actually running this scope with the request.
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const draftId = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')
  return (
    <main>
      <h1 id="private-content">Private composer content</h1>
      <p id="cookie-value">Cookie: {flavor}</p>
      <p id="draft-id">{draftId}</p>
    </main>
  )
}

export default async function ComposerPage() {
  // A request-input read outside the cache scope, mirroring real apps (v0
  // reads headers() at the page level). Without it, the build-time prerender
  // fills the private cache with an empty request context and the composer
  // lands in the static shell, which would defeat the point of the fixture.
  await cookies()
  return <Composer />
}
