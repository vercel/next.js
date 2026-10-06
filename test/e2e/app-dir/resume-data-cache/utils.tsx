export async function tasky() {
  // make cache-misses noticeable
  await new Promise((resolve) => setTimeout(resolve))
}

/**
 * A wrapper meant to ensure fetches with independent tags are cached separately
 * so that tests don't interfere with each others' fetch caches.
 * */
export async function fetchRandomWithForceCache(
  opts: { tag: string } | { key: string; tag: undefined }
) {
  let key: string
  let tag: string | undefined
  if ('key' in opts) {
    key = opts.key
    tag = undefined
  } else {
    key = tag = opts.tag
  }
  return fetch(
    `https://next-data-api-endpoint.vercel.app/api/random?key=${encodeURIComponent(key)}`,
    { cache: 'force-cache', next: { tags: tag !== undefined ? [tag] : [] } }
  )
}
