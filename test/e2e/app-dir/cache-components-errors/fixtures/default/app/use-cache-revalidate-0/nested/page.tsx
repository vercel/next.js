import { cacheLife } from 'next/cache'

async function innerCache() {
  'use cache'
  cacheLife({ revalidate: 0 })
  return Math.random()
}

async function outerCache() {
  'use cache'
  // Explicitly not setting a `cacheLife` here means this will use the implicit
  // default cache life, i.e. the shortest cache life of any nested 'use cache'
  // will be applied, or the values of the 'default' profile if none are nested.
  return innerCache()
}

export default async function Page() {
  let result: number | undefined
  try {
    result = await outerCache()
  } catch {}

  return (
    <>
      <p>
        This page tests that a nested "use cache" with zero revalidate inside
        another "use cache" without explicit cacheLife throws an error during
        prerendering.
      </p>
      <p>
        The inner cache function is cached with a zero revalidate time. Such a
        short-lived cache would normally create a dynamic hole and be excluded
        from prerenders. However, when nested inside another 'use cache' that
        doesn't specify an explicit `cacheLife`, this will error during
        prerendering, instead of silently creating a dynamic hole. This is to
        prevent accidental misconfigurations, where a developer may forget to
        set an explicit `cacheLife` on an outer 'use cache' boundary, not
        knowing that a nested 'use cache' is using a short-lived cache, which
        would degrade the outer 'use cache' to a dynamic hole. If there is an
        outer suspense boundary, this might not be noticeable, so we error
        during prerendering to make sure the developer is aware of the situation
        and picks an explicit `cacheLife` for the outer 'use cache'.
      </p>
      <p>
        This page also tests that the error cannot be caught by userland code
        (the try/catch above should NOT suppress the build error).
      </p>
      <p>Result: {result}</p>
    </>
  )
}
