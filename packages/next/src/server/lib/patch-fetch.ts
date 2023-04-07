import type { StaticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'
import type * as ServerHooks from '../../client/components/hooks-server-context'

import { AppRenderSpan } from './trace/constants'
import { getTracer, SpanKind } from './trace/tracer'
import { CACHE_ONE_YEAR } from '../../lib/constants'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

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
        // RequestInit doesn't keep extra fields e.g. next so it's
        // only available if init is used separate
        let curRevalidate =
          typeof init?.next?.revalidate !== 'undefined'
            ? init?.next?.revalidate
            : isRequestInput
            ? (input as any).next?.revalidate
            : undefined

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
        if (typeof curRevalidate === 'number') {
          revalidate = curRevalidate
        }

        if (curRevalidate === false) {
          revalidate = CACHE_ONE_YEAR
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
          staticGenerationStore.revalidate === 0

        if (isForceNoStore) {
          revalidate = 0
        }

        if (typeof revalidate === 'undefined') {
          if (isOnlyCache && _cache === 'no-store') {
            throw new Error(
              `cache: 'no-store' used on fetch for ${input.toString()} with 'export const fetchCache = 'only-cache'`
            )
          }

          if (isOnlyNoStore) {
            revalidate = 0

            if (_cache === 'force-cache') {
              throw new Error(
                `cache: 'force-cache' used on fetch for ${input.toString()} with 'export const fetchCache = 'only-no-store'`
              )
            }
          } else if (autoNoCache) {
            revalidate = 0
          } else if (isDefaultNoStore) {
            revalidate = 0
          } else {
            revalidate =
              typeof staticGenerationStore.revalidate === 'boolean' ||
              typeof staticGenerationStore.revalidate === 'undefined'
                ? CACHE_ONE_YEAR
                : staticGenerationStore.revalidate
          }
        }

        if (
          // we don't consider autoNoCache to switch to dynamic during
          // revalidate although if it occurs during build we do
          !autoNoCache &&
          (typeof staticGenerationStore.revalidate === 'undefined' ||
            (typeof revalidate === 'number' &&
              revalidate < staticGenerationStore.revalidate))
        ) {
          staticGenerationStore.revalidate = revalidate
        }

        let cacheKey: string | undefined
        if (
          staticGenerationStore.incrementalCache &&
          typeof revalidate === 'number' &&
          revalidate > 0
        ) {
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

        const doOriginalFetch = async () => {
          return originFetch(input, init).then(async (res) => {
            if (
              res.ok &&
              staticGenerationStore.incrementalCache &&
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
                await staticGenerationStore.incrementalCache.set(
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

        if (cacheKey && staticGenerationStore?.incrementalCache) {
          const entry = staticGenerationStore.isOnDemandRevalidate
            ? null
            : await staticGenerationStore.incrementalCache.get(
                cacheKey,
                true,
                revalidate
              )

          if (entry?.value && entry.value.kind === 'FETCH') {
            // when stale and is revalidating we wait for fresh data
            // so the revalidated entry has the updated data
            if (!staticGenerationStore.isRevalidate || !entry.isStale) {
              if (entry.isStale) {
                if (!staticGenerationStore.pendingRevalidates) {
                  staticGenerationStore.pendingRevalidates = []
                }
                staticGenerationStore.pendingRevalidates.push(
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
  ;(fetch as any).__nextPatched = true
}
