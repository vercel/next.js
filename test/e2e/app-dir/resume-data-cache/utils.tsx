import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

export async function tasky() {
  // make cache-misses noticeable
  await new Promise((resolve) => setTimeout(resolve))
}

const ONE_YEAR = 365 * 24 * 60 * 60

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
    {
      cache: 'force-cache',
      next: {
        tags: tag !== undefined ? [tag] : [],
        revalidate: ONE_YEAR, // avoid automatic revalidations
      },
    }
  )
}

export async function RDCInfo() {
  const data = (() => {
    const workUnitStore = workUnitAsyncStorage.getStore()!
    switch (workUnitStore.type) {
      case 'prerender-runtime':
      case 'prerender':
      case 'request': {
        const { resumeDataCache: rdc } = workUnitStore
        return {
          type: workUnitStore.type,
          mutable: rdc.mutable,
          cache: rdc.cache.size,
          fetch: rdc.fetch.size,
        }
      }
      default: {
        return { type: workUnitStore.type }
      }
    }
  })()
  return (
    <p>
      {`RDC info: ${JSON.stringify(data)}`}
      <div hidden>
        {`BEGIN_RDC_INFO.${btoa(JSON.stringify(data))}.END_RDC_INFO`}
      </div>
    </p>
  )
}
