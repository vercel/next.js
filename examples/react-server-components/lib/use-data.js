let endpoint = ''
const publicUrl = process.env.NEXT_PUBLIC_VERCEL_URL

if (publicUrl !== undefined && !publicUrl.includes('localhost')) {
  endpoint = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
} else {
  endpoint = 'http://localhost:3000'
}

const cache = {}

export function useData(key, fetcher, opts = {}) {
  const now = Date.now()
  function mutate() {
    cache[key].isValidating = true
    return fetcher(endpoint + key).then(
      (r) => {
        cache[key].isValidating = false
        cache[key].timestamp = Date.now()
        cache[key].data = r
        return r
      },
      (err) => {
        cache[key].isValidating = false
        console.error(err)
      }
    )
  }

  const createFetcher = () => () => {
    const { data, isValidating, promise } = cache[key]
    if (data !== undefined && !isValidating) {
      return data
    }
    if (!promise) {
      cache[key].promise = mutate()
    }
    throw cache[key].promise
  }

  if (!cache[key]) {
    cache[key] = {
      data: undefined,
      promise: null,
      timestamp: 0,
      isValidating: false,
    }
    cache[key].fn = createFetcher()
  } else {
    if (opts.revalidate) {
      const timeDiff = now - cache[key].timestamp

      // revalidate
      if (timeDiff > opts.revalidate * 1000) {
        cache[key].data = undefined
        cache[key].promise = undefined
      }
    }
  }

  return cache[key].fn()
}
