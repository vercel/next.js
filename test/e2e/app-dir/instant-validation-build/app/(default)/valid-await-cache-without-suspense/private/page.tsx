export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  await privateCachedIO()
  return (
    <main>
      <p>
        This page awaits a private cache. stage. The page is runtime
        prefetchable, so this should never need a suspense boundary. This is a
        sanity check to make sure that we warm caches correctly when validating.
      </p>
    </main>
  )
}

async function privateCachedIO() {
  'use cache: private'
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
}
