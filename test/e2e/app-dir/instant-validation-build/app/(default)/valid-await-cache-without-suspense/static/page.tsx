export const unstable_instant = {
  prefetch: 'static',
}

export default async function Page() {
  await cachedIO()
  return (
    <main>
      <p>
        This page awaits a cache. This should never need a suspense boundary.
        This is a sanity check to make sure that we warm caches correctly when
        validating.
      </p>
    </main>
  )
}

async function cachedIO() {
  'use cache'
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
}
