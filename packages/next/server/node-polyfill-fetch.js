import fetch, {
  Headers,
  Request,
  Response,
} from 'next/dist/compiled/node-fetch'
import LRU from 'next/dist/compiled/lru-cache'

const MAX_TOTAL_CACHE = 100 * 1024 * 1024
const MAX_RESPONSE_FOR_CACHE = 10 * 1024 * 1024

const cache = new LRU({
  maxSize: MAX_TOTAL_CACHE,
  sizeCalculation: (response) => {
    return +response.headers['content-length']
  },
})

// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  const agent = ({ protocol }) =>
    protocol === 'http:' ? global.__NEXT_HTTP_AGENT : global.__NEXT_HTTPS_AGENT
  const fetchWithAgent = (url, opts, ...rest) => {
    if (!opts) {
      opts = { agent }
    } else if (!opts.agent) {
      opts.agent = agent
    }
    let canBeCached =
      process.env.NODE_ENV === 'production' &&
      (!opts ||
        (opts.method === 'GET' &&
          !opts.body &&
          !opts.cache &&
          !opts.signal &&
          (!opts.headers || !opts.headers.pragma)))
    let cacheKey
    if (canBeCached) {
      cacheKey = `${url}|${JSON.stringify({ ...opts, agent: undefined })}`
      const cachedResponse = cache.get(cacheKey)
      if (cachedResponse !== undefined) return cachedResponse.clone()
    }
    /** @type {Response} */
    const response = fetch(url, opts, ...rest)
    const size = response.headers && +response.headers['content-length']
    if (canBeCached && !isNaN(size) && size < MAX_RESPONSE_FOR_CACHE) {
      cache.set(cacheKey, response.clone())
    }
    return response
  }
  global.fetch = fetchWithAgent
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
}
