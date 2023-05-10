import type { StaticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'
import type * as ServerHooks from '../../client/components/hooks-server-context'

import { AppRenderSpan } from './trace/constants'
import { getTracer, SpanKind } from './trace/tracer'
import { CACHE_ONE_YEAR } from '../../lib/constants'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

export function addImplicitTags(
  staticGenerationStore: ReturnType<StaticGenerationAsyncStorage['getStore']>
) {
  const newTags: string[] = []
  const pathname = staticGenerationStore?.originalPathname
  if (!pathname) {
    return newTags
  }

  if (!Array.isArray(staticGenerationStore.tags)) {
    staticGenerationStore.tags = []
  }
  if (!staticGenerationStore.tags.includes(pathname)) {
    staticGenerationStore.tags.push(pathname)
  }
  newTags.push(pathname)
  return newTags
}

function trackFetchMetric(
  staticGenerationStore: ReturnType<StaticGenerationAsyncStorage['getStore']>,
  ctx: {
    url: string
    status: number
    method: string
    cacheStatus: 'hit' | 'miss'
    start: number
  }
) {
  if (!staticGenerationStore) return
  if (!staticGenerationStore.fetchMetrics) {
    staticGenerationStore.fetchMetrics = []
  }
  const dedupeFields = ['url', 'status', 'method']

  // don't add metric if one already exists for the fetch
  if (
    ctx.cacheStatus !== 'miss' &&
    staticGenerationStore.fetchMetrics.some((metric) => {
      return dedupeFields.every(
        (field) => (metric as any)[field] === (ctx as any)[field]
      )
    })
  ) {
    return
  }
  staticGenerationStore.fetchMetrics.push({
    url: ctx.url,
    cacheStatus: ctx.cacheStatus,
    status: ctx.status,
    method: ctx.method,
    start: ctx.start,
    end: Date.now(),
    idx: staticGenerationStore.nextFetchId || 0,
  })
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
    let url: URL | undefined
    try {
      url = new URL(input instanceof Request ? input.url : input)
      url.username = ''
      url.password = ''
    } catch {
      // Error caused by malformed URL should be handled by native fetch
      url = undefined
    }
    const fetchStart = Date.now()
    const method = init?.method?.toUpperCase() || 'GET'

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
        const staticGenerationStore = staticGenerationAsyncStorage.getStore()
        const isRequestInput =
          input &&
          typeof input === 'object' &&
          typeof (input as Request).method === 'string'

        const getRequestMeta = (field: string) => {
          let value = isRequestInput ? (input as any)[field] : null
          return value || (init as any)?.[field]
        }

        // If the staticGenerationStore is not available, we can't do any
        // special treatment of fetch, therefore fallback to the original
        // fetch implementation.
        if (!staticGenerationStore || (init?.next as any)?.internal) {
          return originFetch(input, init)
        }

        let revalidate: number | undefined | false = undefined
        const getNextField = (field: 'revalidate' | 'tags') => {
          return typeof init?.next?.[field] !== 'undefined'
            ? init?.next?.[field]
            : isRequestInput
            ? (input as any).next?.[field]
            : undefined
        }
        // RequestInit doesn't keep extra fields e.g. next so it's
        // only available if init is used separate
        let curRevalidate = getNextField('revalidate')
        const tags: string[] = getNextField('tags') || []

        if (Array.isArray(tags)) {
          if (!staticGenerationStore.tags) {
            staticGenerationStore.tags = []
          }
          for (const tag of tags) {
            if (!staticGenerationStore.tags.includes(tag)) {
              staticGenerationStore.tags.push(tag)
            }
          }
        }
        const implicitTags = addImplicitTags(staticGenerationStore)

        for (const tag of implicitTags || []) {
          if (!tags.includes(tag)) {
            tags.push(tag)
          }
        }
        const isOnlyCache = staticGenerationStore.fetchCache === 'only-cache'
        const isForceCache = staticGenerationStore.fetchCache === 'force-cache'
        const isDefaultNoStore =
          staticGenerationStore.fetchCache === 'default-no-store'
        const isOnlyNoStore =
          staticGenerationStore.fetchCache === 'only-no-store'
        const isForceNoStore =
          staticGenerationStore.fetchCache === 'force-no-store'

        const _cache = getRequestMeta('cache')

        if (_cache === 'force-cache' || isForceCache) {
          curRevalidate = false
        }
        if (['no-cache', 'no-store'].includes(_cache || '')) {
          curRevalidate = 0
        }
        if (typeof curRevalidate === 'number' || curRevalidate === false) {
          revalidate = curRevalidate
        }

        const _headers = getRequestMeta('headers')
        const initHeaders: Headers =
          typeof _headers?.get === 'function'
            ? _headers
            : new Headers(_headers || {})

        const hasUnCacheableHeader =
          initHeaders.get('authorization') || initHeaders.get('cookie')

        const isUnCacheableMethod = !['get', 'head'].includes(
          getRequestMeta('method')?.toLowerCase() || 'get'
        )

        // if there are authorized headers or a POST method and
        // dynamic data usage was present above the tree we bail
        // e.g. if cookies() is used before an authed/POST fetch
        const autoNoCache =
          (hasUnCacheableHeader || isUnCacheableMethod) &&
          (staticGenerationStore.usedHeaders ||
            staticGenerationStore.isNonStaticMethod)

        if (isForceNoStore) {
          revalidate = 0
        }

        if (isOnlyNoStore) {
          if (_cache === 'force-cache' || revalidate === 0) {
            throw new Error(
              `cache: 'force-cache' used on fetch for ${input.toString()} with 'export const fetchCache = 'only-no-store'`
            )
          }
          revalidate = 0
        }

        if (typeof revalidate === 'undefined') {
          if (isOnlyCache && _cache === 'no-store') {
            throw new Error(
              `cache: 'no-store' used on fetch for ${input.toString()} with 'export const fetchCache = 'only-cache'`
            )
          }

          if (autoNoCache) {
            revalidate = 0
          } else if (isDefaultNoStore) {
            revalidate = 0
          } else {
            revalidate =
              staticGenerationStore.revalidate === 0 ||
              typeof staticGenerationStore.revalidate === 'boolean' ||
              typeof staticGenerationStore.revalidate === 'undefined'
                ? false
                : staticGenerationStore.revalidate
          }
        }

        if (
          // we don't consider autoNoCache to switch to dynamic during
          // revalidate although if it occurs during build we do
          !autoNoCache &&
          (typeof staticGenerationStore.revalidate === 'undefined' ||
            (typeof revalidate === 'number' &&
              (staticGenerationStore.revalidate === false ||
                (typeof staticGenerationStore.revalidate === 'number' &&
                  revalidate < staticGenerationStore.revalidate))))
        ) {
          staticGenerationStore.revalidate = revalidate
        }

        const isCacheableRevalidate =
          (typeof revalidate === 'number' && revalidate > 0) ||
          revalidate === false

        let cacheKey: string | undefined
        if (staticGenerationStore.incrementalCache && isCacheableRevalidate) {
          try {
            cacheKey =
              await staticGenerationStore.incrementalCache.fetchCacheKey(
                isRequestInput ? (input as Request).url : input.toString(),
                isRequestInput ? (input as RequestInit) : init
              )
          } catch (err) {
            console.error(`Failed to generate cache key for`, input)
          }
        }
        const requestInputFields = [
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
        ]

        if (isRequestInput) {
          const reqInput: Request = input as any
          const reqOptions: RequestInit = {
            body: (reqInput as any)._ogBody || reqInput.body,
          }

          for (const field of requestInputFields) {
            // @ts-expect-error custom fields
            reqOptions[field] = reqInput[field]
          }
          input = new Request(reqInput.url, reqOptions)
        } else if (init) {
          const initialInit = init
          init = {
            body: (init as any)._ogBody || init.body,
          }
          for (const field of requestInputFields) {
            // @ts-expect-error custom fields
            init[field] = initialInit[field]
          }
        }

        const fetchUrl = url?.toString() ?? ''
        const fetchIdx = staticGenerationStore.nextFetchId ?? 1
        staticGenerationStore.nextFetchId = fetchIdx + 1

        const normalizedRevalidate = !revalidate ? CACHE_ONE_YEAR : revalidate

        const doOriginalFetch = async (isStale?: boolean) => {
          // add metadata to init without editing the original
          const clonedInit = {
            ...init,
            next: { ...init?.next, fetchType: 'origin', fetchIdx },
          }

          return originFetch(input, clonedInit).then(async (res) => {
            if (!isStale) {
              trackFetchMetric(staticGenerationStore, {
                start: fetchStart,
                url: fetchUrl,
                cacheStatus: 'miss',
                status: res.status,
                method: clonedInit.method || 'GET',
              })
            }
            if (
              res.status === 200 &&
              staticGenerationStore.incrementalCache &&
              cacheKey &&
              isCacheableRevalidate
            ) {
              const bodyBuffer = Buffer.from(await res.arrayBuffer())

              try {
                await staticGenerationStore.incrementalCache.set(
                  cacheKey,
                  {
                    kind: 'FETCH',
                    data: {
                      headers: Object.fromEntries(res.headers.entries()),
                      body: bodyBuffer.toString('base64'),
                      status: res.status,
                      tags,
                    },
                    revalidate: normalizedRevalidate,
                  },
                  normalizedRevalidate,
                  true,
                  fetchUrl,
                  fetchIdx
                )
              } catch (err) {
                console.warn(`Failed to set fetch cache`, input, err)
              }

              return new Response(bodyBuffer, {
                headers: new Headers(res.headers),
                status: res.status,
              })
            }
            return res
          })
        }

        if (cacheKey && staticGenerationStore?.incrementalCache) {
          const entry = staticGenerationStore.isOnDemandRevalidate
            ? null
            : await staticGenerationStore.incrementalCache.get(
                cacheKey,
                true,
                normalizedRevalidate,
                fetchUrl,
                fetchIdx
              )

          if (entry?.value && entry.value.kind === 'FETCH') {
            const currentTags = entry.value.data.tags
            // when stale and is revalidating we wait for fresh data
            // so the revalidated entry has the updated data
            if (!(staticGenerationStore.isRevalidate && entry.isStale)) {
              if (entry.isStale) {
                if (!staticGenerationStore.pendingRevalidates) {
                  staticGenerationStore.pendingRevalidates = []
                }
                staticGenerationStore.pendingRevalidates.push(
                  doOriginalFetch(true).catch(console.error)
                )
              } else if (
                tags &&
                !tags.every((tag) => currentTags?.includes(tag))
              ) {
                // if new tags are being added we need to set even if
                // the data isn't stale
                if (!entry.value.data.tags) {
                  entry.value.data.tags = []
                }

                for (const tag of tags) {
                  if (!entry.value.data.tags.includes(tag)) {
                    entry.value.data.tags.push(tag)
                  }
                }
                staticGenerationStore.incrementalCache?.set(
                  cacheKey,
                  entry.value,
                  revalidate,
                  true,
                  fetchUrl,
                  fetchIdx
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

              trackFetchMetric(staticGenerationStore, {
                start: fetchStart,
                url: fetchUrl,
                cacheStatus: 'hit',
                status: resData.status || 200,
                method: init?.method || 'GET',
              })

              return new Response(decodedBody, {
                headers: resData.headers,
                status: resData.status,
              })
            }
          }
        }

        if (staticGenerationStore.isStaticGeneration) {
          if (init && typeof init === 'object') {
            const cache = init.cache
            // Delete `cache` property as Cloudflare Workers will throw an error
            if (isEdgeRuntime) {
              delete init.cache
            }
            if (cache === 'no-store') {
              staticGenerationStore.revalidate = 0
              // TODO: ensure this error isn't logged to the user
              // seems it's slipping through currently
              const dynamicUsageReason = `no-store fetch ${input}${
                staticGenerationStore.pathname
                  ? ` ${staticGenerationStore.pathname}`
                  : ''
              }`
              const err = new DynamicServerError(dynamicUsageReason)
              staticGenerationStore.dynamicUsageStack = err.stack
              staticGenerationStore.dynamicUsageDescription = dynamicUsageReason

              throw err
            }

            const hasNextConfig = 'next' in init
            const next = init.next || {}
            if (
              typeof next.revalidate === 'number' &&
              (typeof staticGenerationStore.revalidate === 'undefined' ||
                next.revalidate < staticGenerationStore.revalidate)
            ) {
              const forceDynamic = staticGenerationStore.forceDynamic

              if (!forceDynamic || next.revalidate !== 0) {
                staticGenerationStore.revalidate = next.revalidate
              }

              if (!forceDynamic && next.revalidate === 0) {
                const dynamicUsageReason = `revalidate: ${
                  next.revalidate
                } fetch ${input}${
                  staticGenerationStore.pathname
                    ? ` ${staticGenerationStore.pathname}`
                    : ''
                }`
                const err = new DynamicServerError(dynamicUsageReason)
                staticGenerationStore.dynamicUsageStack = err.stack
                staticGenerationStore.dynamicUsageDescription =
                  dynamicUsageReason

                throw err
              }
            }
            if (hasNextConfig) delete init.next
          }
        }

        return doOriginalFetch()
      }
    )
  }
  ;(fetch as any).__nextGetStaticStore = () => {
    return staticGenerationAsyncStorage
  }
  ;(fetch as any).__nextPatched = true
}
