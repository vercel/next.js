import { cache } from 'react'

// `generateMetadata` runs concurrently with the page. The page reports the
// render's spans once `generateMetadata` of the layout and the page ran (per
// request, via `cache`), so the `generateMetadata` spans are always among them.

type Segment = 'layout' | 'page'

const getDeferred = cache((_segment: Segment) => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
})

export function markMetadataGenerated(segment: Segment) {
  getDeferred(segment).resolve()
}

export async function metadataGenerated() {
  // Don't hang when `generateMetadata` doesn't run for this render (e.g. its
  // result was prerendered).
  let timeout: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.all([getDeferred('layout').promise, getDeferred('page').promise]),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, 5_000)
    }),
  ])
  clearTimeout(timeout)
}
