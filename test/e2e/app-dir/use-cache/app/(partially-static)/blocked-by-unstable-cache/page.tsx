import { revalidateTag, unstable_cache } from 'next/cache'
import { setTimeout } from 'node:timers/promises'

const getUnstableTime = unstable_cache(
  async () => {
    // Small artificial delay so the foreground-await is actually in flight when
    // the prospective prerender decides whether `cacheSignal` is ready.
    await setTimeout(100)
    return new Date().toISOString()
  },
  ['blocked-by-unstable-cache'],
  { tags: ['blocked-by-unstable-cache-tag'], revalidate: false }
)

async function Cached() {
  'use cache'
  return (
    <p>
      Cached: <span id="cached-time">{new Date().toISOString()}</span>
    </p>
  )
}

// Awaiting an `unstable_cache` BEFORE rendering a `'use cache'` component.
// After the tag is revalidated, the next render runs a background revalidation
// prerender. In its prospective phase, the `unstable_cache` lookup hits a stale
// entry and foreground-awaits the recompute. The downstream `<Cached />` must
// still be reached during prospective so its RDC entry is populated for the
// final phase — otherwise the final phase throws "Unexpected cache miss after
// cache warming phase during prerendering".
export default async function Page() {
  const time = await getUnstableTime()

  return (
    <main>
      <p>
        Unstable: <span id="unstable-time">{time}</span>
      </p>
      <Cached />
      <form
        action={async () => {
          'use server'
          revalidateTag('blocked-by-unstable-cache-tag', 'max')
        }}
      >
        <button id="revalidate">Revalidate</button>
      </form>
    </main>
  )
}
