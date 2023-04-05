import type {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../client/components/static-generation-async-storage'
import type * as ServerHooks from '../../client/components/hooks-server-context'

import { AppRenderSpan } from './trace/constants'
import { getTracer, SpanKind } from './trace/tracer'
import { CACHE_ONE_YEAR } from '../../lib/constants'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const CACHEABLE_METHODS = ['GET', 'HEAD']

const NON_CACHEABLE_HEADERS = ['authorization', 'cookie']

// @ts-expect-error - duplex is not in the type definition
const REQUEST_INPUT_FIELDS: ReadonlyArray<keyof Request & keyof RequestInit> = [
  'cache',
  'credentials',
  'headers',
  'integrity',
  'keepalive',
  'method',
  'mode',
  'redirect',
  'referrer',
  'referrerPolicy',
  'signal',
  'window',
  'duplex',
] as const

/**
 * This will get an option from either the `init` value (if it's truthy) or
 * the `input` value (if it's a `Request`).
 *
 * @param input the request info
 * @param init the request init
 * @param key the key to get
 */
function getOption<K extends keyof Request>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  key: K
): Request[K] | undefined
function getOption<K extends keyof RequestInit>(
  input: RequestInfo | URL,
  init: RequestInit,
  key: K
): RequestInit[K] | undefined
function getOption<K extends keyof (Request | RequestInit)>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  key: K
): unknown {
  let value
  if (init && key in init) {
    value = init[key]
    if (value) return value
  }

  if (input instanceof Request && key in input) {
    value = input[key]
    if (value) return value
  }
}

/**
 * Get the revalidate value to use for the fetch based on the fetch config
 * and the page's static generation store.
 *
 * @param fetchNextRevalidate the current revalidate value from the fetch config
 * @param fetchCache the cache value from the fetch config
 * @param store the static generation store
 * @returns the revalidate value to use for the fetch
 */
function getRevalidate(
  fetchNextRevalidate: number | false | undefined,
  input: Readonly<RequestInfo | URL>,
  init: Readonly<RequestInit | undefined>,
  store: Readonly<StaticGenerationStore>
): number | undefined {
  // Get the fetch cache value from the fetch config.
  const fetchCache = getOption(input, init, 'cache')

  // If the store is set to `only-cache` and the fetch cache is set to
  // `no-store` then throw an error.
  if (store.fetchCache === 'only-cache' && fetchCache === 'no-store') {
    throw new Error(
      `cache: 'no-store' used on fetch for ${input.toString()} with 'export const fetchCache = 'only-cache'`
    )
  }

  // If the store is set to `only-no-store` and the fetch cache is set to
  // `force-cache` then throw an error.
  if (store.fetchCache === 'only-no-store' && fetchCache === 'force-cache') {
    throw new Error(
      `cache: 'force-cache' used on fetch for ${input.toString()} with 'export const fetchCache = 'only-no-store'`
    )
  }

  switch (fetchCache) {
    // If the fetch cache is set to `no-cache` or `no-store` then set the
    // revalidate to `0` to prevent the fetch from caching (it expires
    // immediately).
    case 'no-cache':
    case 'no-store':
      return 0
    // If the fetch cache is set to `force-cache` then set the revalidate to
    // `CACHE_ONE_YEAR` to ensure the cache is used for the maximum amount of
    // time.
    case 'force-cache':
      return CACHE_ONE_YEAR
    default:
  }

  switch (store.fetchCache) {
    // If the page's store is set to `force-cache` then set the revalidate to
    // `CACHE_ONE_YEAR` to ensure the cache is used for the maximum amount of
    // time.
    case 'force-cache':
      return CACHE_ONE_YEAR
    // If the page's store is set to `force-no-store` then set the revalidate
    // to `0` to prevent the fetch from caching (it expires immediately).
    case 'force-no-store':
      return 0
    default:
  }

  // If the fetch next revalidate value is `false` then set the revalidate to
  // `CACHE_ONE_YEAR` to ensure the cache is used for the maximum amount of
  // time.
  if (fetchNextRevalidate === false) {
    return CACHE_ONE_YEAR
  }

  // If the fetch next revalidate value is a number, return that!
  if (typeof fetchNextRevalidate === 'number') {
    return fetchNextRevalidate
  }

  if (store.fetchCache === 'only-no-store') {
    return 0
  }

  // Get the headers for the fetch request and check if any of the headers
  // are not cacheable.
  const headers = getOption(input, init, 'headers')
  const hasNonCacheableHeaders: boolean = NON_CACHEABLE_HEADERS.some((header) =>
    headers?.get(header)
  )

  // Get the method for the fetch request and check if it is not cacheable.
  const method = getOption(input, init, 'method')?.toUpperCase() ?? 'GET'
  const hasNonCacheableMethod = CACHEABLE_METHODS.every((m) => m !== method)

  // If the revalidate value in the store is `0` and the fetch has a header
  // that is not cacheable or the method is not cacheable then set the
  // revalidate to `0` to prevent the fetch from caching (it expires
  // immediately).
  if (
    store.revalidate === 0 &&
    (hasNonCacheableHeaders || hasNonCacheableMethod)
  ) {
    return 0
  }

  // If the page's store is set to `default-no-store` then set the revalidate
  // to `0` to prevent the fetch from caching (it expires immediately).
  if (store.fetchCache === 'default-no-store') {
    return 0
  }

  // If the page's store is a boolean (false) or undefined then set the
  // revalidate to `CACHE_ONE_YEAR` to ensure the cache is used for the
  // maximum amount of time.
  if (
    typeof store.revalidate === 'boolean' ||
    typeof store.revalidate === 'undefined'
  ) {
    return CACHE_ONE_YEAR
  }

  // At this point, the page's store is a number or undefined so we return that!
  return store.revalidate
}

// we patch fetch to collect cache information used for
// determining if a page is static or not
export function patchFetch({
  serverHooks,
  staticGenerationAsyncStorage,
}: {
  serverHooks: typeof ServerHooks
  staticGenerationAsyncStorage: StaticGenerationAsyncStorage
}) {
  if ((globalThis.fetch as any).__nextPatched) return

  const { DynamicServerError } = serverHooks
  const originFetch = globalThis.fetch

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init: RequestInit | undefined
  ) => {
    let url
    try {
      url = new URL(input instanceof Request ? input.url : input)
      url.username = ''
      url.password = ''
    } catch {
      // Error caused by malformed URL should be handled by native fetch
      url = undefined
    }

    // Get the next config from the init and merge it with the one from the
    // input if it exists. The next config from the input will take precedence.
    let next: NextFetchRequestConfig | undefined
    if (init && 'next' in init) {
      next = { ...init.next }
    }
    if (
      input instanceof Request &&
      'next' in input &&
      (input as RequestInit).next
    ) {
      // The nasty `(input as RequestInit).next` is needed
      // because it's not passing the type check correctly.
      if (next) {
        next = { ...next, ...(input as RequestInit).next }
      } else {
        next = { ...(input as RequestInit).next }
      }
    }

    // Get the request method. This will internally default to GET if the
    // method is not specified.
    const method = getOption(input, init, 'method')?.toUpperCase() ?? 'GET'

    return await getTracer().trace(
      AppRenderSpan.fetch,
      {
        kind: SpanKind.CLIENT,
        spanName: ['fetch', method, url?.toString() ?? input.toString()]
          .filter(Boolean)
          .join(' '),
        attributes: {
          'http.url': url?.toString(),
          'http.method': method,
          'net.peer.name': url?.hostname,
          'net.peer.port': url?.port || undefined,
        },
      },
      async () => {
        const store = staticGenerationAsyncStorage.getStore()

        // If the staticGenerationStore is not available, we can't do any
        // special treatment of fetch, therefore fallback to the original
        // fetch implementation.
        if (!store || (next as any)?.internal) {
          return originFetch(input, init)
        }

        // Calculate the revalidate value for the fetch request.
        let revalidate = getRevalidate(next?.revalidate, input, init, store)

        // If the store does not have a revalidate value or the revalidate
        // value is less than the store's revalidate value, we update the
        // store's revalidate value.
        if (
          typeof store.revalidate === 'undefined' ||
          (typeof revalidate === 'number' && revalidate < store.revalidate)
        ) {
          store.revalidate = revalidate
        }

        // Ensure that we copy over only the fields that are allowed to be
        // copied over to the new Request instance.
        if (input instanceof Request) {
          const options: Record<string, any> = {
            body: (input as any)._ogBody || input.body,
          }

          for (const field of REQUEST_INPUT_FIELDS) {
            options[field] = input[field]
          }

          input = new Request(input.url, options)
        } else if (init) {
          const copy: Record<string, any> = {
            body: (init as any)._ogBody || init.body,
          }
          for (const field of REQUEST_INPUT_FIELDS) {
            copy[field] = init[field]
          }
          init = copy
        }

        // If the incremental cache is available and the revalidate value is
        // a number greater than 0, we generate a cache key for the fetch
        // request.
        let cacheKey: string | undefined
        if (
          store.incrementalCache &&
          typeof revalidate === 'number' &&
          revalidate > 0
        ) {
          try {
            cacheKey = await store.incrementalCache.fetchCacheKey(
              input instanceof Request ? input.url : input.toString(),
              input instanceof Request ? input : init
            )
          } catch {
            console.error(`Failed to generate cache key for`, input)
          }
        }

        const doOriginalFetch = async () => {
          return originFetch(input, init).then(async (res) => {
            if (
              store.incrementalCache &&
              cacheKey &&
              typeof revalidate === 'number' &&
              revalidate > 0
            ) {
              let base64Body = ''
              const resBlob = await res.blob()
              const arrayBuffer = await resBlob.arrayBuffer()

              if (process.env.NEXT_RUNTIME === 'edge') {
                const { encode } =
                  require('../../shared/lib/bloom-filter/base64-arraybuffer') as typeof import('../../shared/lib/bloom-filter/base64-arraybuffer')
                base64Body = encode(arrayBuffer)
              } else {
                base64Body = Buffer.from(arrayBuffer).toString('base64')
              }

              try {
                await store.incrementalCache.set(
                  cacheKey,
                  {
                    kind: 'FETCH',
                    data: {
                      headers: Object.fromEntries(res.headers.entries()),
                      body: base64Body,
                      status: res.status,
                    },
                    revalidate,
                  },
                  revalidate,
                  true
                )
              } catch (err) {
                console.warn(`Failed to set fetch cache`, input, err)
              }

              return new Response(resBlob, {
                headers: res.headers,
                status: res.status,
              })
            }
            return res
          })
        }

        if (cacheKey && store.incrementalCache) {
          const entry = store.isOnDemandRevalidate
            ? null
            : await store.incrementalCache.get(cacheKey, true, revalidate)

          if (entry?.value && entry.value.kind === 'FETCH') {
            // when stale and is revalidating we wait for fresh data
            // so the revalidated entry has the updated data
            if (!store.isRevalidate || !entry.isStale) {
              if (entry.isStale) {
                if (!store.pendingRevalidates) {
                  store.pendingRevalidates = []
                }
                store.pendingRevalidates.push(
                  doOriginalFetch().catch(console.error)
                )
              }

              const resData = entry.value.data
              let decodedBody: ArrayBuffer

              if (process.env.NEXT_RUNTIME === 'edge') {
                const { decode } =
                  require('../../shared/lib/bloom-filter/base64-arraybuffer') as typeof import('../../shared/lib/bloom-filter/base64-arraybuffer')
                decodedBody = decode(resData.body)
              } else {
                decodedBody = Buffer.from(resData.body, 'base64').subarray()
              }

              return new Response(decodedBody, {
                headers: resData.headers,
                status: resData.status,
              })
            }
          }
        }

        if (store.isStaticGeneration) {
          const cache = getOption(input, init, 'cache')

          // Delete `cache` property as Cloudflare Workers will throw an error
          if (init && isEdgeRuntime) {
            delete init.cache
          }

          // Delete the internal `next` property from the request and inputs.
          if (init && 'next' in init) {
            delete init.next
          }
          if (input instanceof Request && 'next' in input) {
            delete (input as any).next
          }

          // If the cache is set to `no-store` we need to throw a
          // DynamicServerError to ensure the page is not cached because we're
          // in static generation mode.
          if (cache === 'no-store') {
            // If the cache is set to `no-store` we set the revalidate value to
            // 0 to ensure the page is not cached.
            store.revalidate = 0

            // TODO: ensure this error isn't logged to the user seems it's slipping through currently
            const dynamicUsageReason = `no-store fetch ${input}${
              store.pathname ? ` ${store.pathname}` : ''
            }`
            const err = new DynamicServerError(dynamicUsageReason)
            store.dynamicUsageStack = err.stack
            store.dynamicUsageDescription = dynamicUsageReason

            throw err
          }

          // If the fetchNextRevalidate option is a number and either the
          // page's revalidate value is undefined or the fetchNextRevalidate
          // value is less than the page's revalidate value.
          if (
            typeof next?.revalidate === 'number' &&
            (typeof store.revalidate === 'undefined' ||
              next.revalidate < store.revalidate)
          ) {
            // If force dynamic is not set or the revalidate value is not 0,
            // we set the page's revalidate value to the fetchNextRevalidate.
            if (!store.forceDynamic || next.revalidate !== 0) {
              store.revalidate = next.revalidate
            }

            // If force dynamic is not set and the revalidate value is 0, we
            // throw a DynamicServerError to ensure the page is not cached.
            if (!store.forceDynamic && next.revalidate === 0) {
              const dynamicUsageReason = `revalidate: ${
                next.revalidate
              } fetch ${input}${store.pathname ? ` ${store.pathname}` : ''}`

              const err = new DynamicServerError(dynamicUsageReason)
              store.dynamicUsageStack = err.stack
              store.dynamicUsageDescription = dynamicUsageReason

              throw err
            }
          }
        }

        return doOriginalFetch()
      }
    )
  }
  ;(fetch as any).__nextPatched = true
}
