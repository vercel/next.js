import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

export default async function Page() {
  await cachedIO('static')

  await cookies()
  await cachedIO('runtime')

  return (
    <main>
      <p>
        This page awaits a cache that is reachable in the static stage and a
        cache that is reachable in the runtime stage. This should never need a
        suspense boundary. This is a sanity check to make sure that we warm
        caches correctly when validating.
      </p>
    </main>
  )
}

async function cachedIO(key: any) {
  'use cache'
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
  return key
}
