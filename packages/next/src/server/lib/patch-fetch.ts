import type {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../client/components/static-generation-async-storage.external'
import type * as ServerHooks from '../../client/components/hooks-server-context'

import { AppRenderSpan, NextNodeServerSpan } from './trace/constants'
import { getTracer, SpanKind } from './trace/tracer'
import {
  CACHE_ONE_YEAR,
  NEXT_CACHE_IMPLICIT_TAG_ID,
  NEXT_CACHE_TAG_MAX_LENGTH,
} from '../../lib/constants'
import * as Log from '../../build/output/log'
import { trackDynamicFetch } from '../app-render/dynamic-rendering'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

export function validateRevalidate(
  revalidateVal: unknown,
  pathname: string
): undefined | number | false {
  try {
    let normalizedRevalidate: false | number | undefined = undefined

    if (revalidateVal === false) {
      normalizedRevalidate = revalidateVal
    } else if (
      typeof revalidateVal === 'number' &&
      !isNaN(revalidateVal) &&
      revalidateVal > -1
    ) {
      normalizedRevalidate = revalidateVal
    } else if (typeof revalidateVal !== 'undefined') {
      throw new Error(
        `Invalid revalidate value "${revalidateVal}" on "${pathname}", must be a non-negative number or "false"`
      )
    }
    return normalizedRevalidate
  } catch (err: any) {
    // handle client component error from attempting to check revalidate value
    if (err instanceof Error && err.message.includes('Invalid revalidate')) {
      throw err
    }
    return undefined
  }
}

export function validateTags(tags: any[], description: string) {
  const validTags: string[] = []
  const invalidTags: Array<{
    tag: any
    reason: string
  }> = []

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      invalidTags.push({ tag, reason: 'invalid type, must be a string' })
    } else if (tag.length > NEXT_CACHE_TAG_MAX_LENGTH) {
      invalidTags.push({
        tag,
        reason: `exceeded max length of ${NEXT_CACHE_TAG_MAX_LENGTH}`,
      })
    } else {
      validTags.push(tag)
    }
  }

  if (invalidTags.length > 0) {
    console.warn(`Warning: invalid tags passed to ${description}: `)

    for (const { tag, reason } of invalidTags) {
      console.log(`tag: "${tag}" ${reason}`)
    }
  }
  return validTags
}

const getDerivedTags = (pathname: string): string[] => {
  const derivedTags: string[] = [`/layout`]

  // we automatically add the current path segments as tags
  // for revalidatePath handling
  if (pathname.startsWith('/')) {
    const pathnameParts = pathname.split('/')

    for (let i = 1; i < pathnameParts.length + 1; i++) {
      let curPathname = pathnameParts.slice(0, i).join('/')

      if (curPathname) {
        // all derived tags other than the page are layout tags
        if (!curPathname.endsWith('/page') && !curPathname.endsWith('/route')) {
          curPathname = `${curPathname}${
            !curPathname.endsWith('/') ? '/' : ''
          }layout`
        }
        derivedTags.push(curPathname)
      }
    }
  }
  return derivedTags
}

export function addImplicitTags(staticGenerationStore: StaticGenerationStore) {
  const newTags: string[] = []
  const { pagePath, urlPathname } = staticGenerationStore

  if (!Array.isArray(staticGenerationStore.tags)) {
    staticGenerationStore.tags = []
  }

  if (pagePath) {
    const derivedTags = getDerivedTags(pagePath)

    for (let tag of derivedTags) {
      tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${tag}`
      if (!staticGenerationStore.tags?.includes(tag)) {
        staticGenerationStore.tags.push(tag)
      }
      newTags.push(tag)
    }
  }

  if (urlPathname) {
    const parsedPathname = new URL(urlPathname, 'http://n').pathname

    const tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${parsedPathname}`
    if (!staticGenerationStore.tags?.includes(tag)) {
      staticGenerationStore.tags.push(tag)
    }
    newTags.push(tag)
  }
  return newTags
}

function trackFetchMetric(
  staticGenerationStore: StaticGenerationStore,
  ctx: {
    url: string
    status: number
    method: string
    cacheReason: string
    cacheStatus: 'hit' | 'miss' | 'skip'
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
    cacheReason: ctx.cacheReason,
    status: ctx.status,
    method: ctx.method,
    start: ctx.start,
    end: Date.now(),
    idx: staticGenerationStore.nextFetchId || 0,
  })
}

interface PatchableModule {
  serverHooks: typeof ServerHooks
  staticGenerationAsyncStorage: StaticGenerationAsyncStorage
}

// we patch fetch to collect cache information used for
// determining if a page is static or not
export function patchFetch({
  serverHooks,
  staticGenerationAsyncStorage,
}: PatchableModule) {
  if (!(globalThis as any)._nextOriginalFetch) {
    ;(globalThis as any)._nextOriginalFetch = globalThis.fetch
  }

  if ((globalThis.fetch as any).__nextPatched) return

  const { DynamicServerError } = serverHooks
  const originFetch: typeof fetch = (globalThis as any)._nextOriginalFetch

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
    const fetchUrl = url?.href ?? ''
    const fetchStart = Date.now()
    const method = init?.method?.toUpperCase() || 'GET'

    // Do create a new span trace for internal fetches in the
    // non-verbose mode.
    const isInternal = (init?.next as any)?.internal === true
    const hideSpan = process.env.NEXT_OTEL_FETCH_DISABLED === '1'

    return await getTracer().trace(
      isInternal ? NextNodeServerSpan.internalFetch : AppRenderSpan.fetch,
      {
        hideSpan,
        kind: SpanKind.CLIENT,
        spanName: ['fetch', method, fetchUrl].filter(Boolean).join(' '),
        attributes: {
          'http.url': fetchUrl,
          'http.method': method,
          'net.peer.name': url?.hostname,
          'net.peer.port': url?.port || undefined,
        },
      },
      async () => {
        const staticGenerationStore: StaticGenerationStore =
          staticGenerationAsyncStorage.getStore() ||
          (fetch as any).__nextGetStaticStore?.()
        const isRequestInput =
          input &&
          typeof input === 'object' &&
          typeof (input as Request).method === 'string'

        const getRequestMeta = (field: string) => {
          // If request input is present but init is not, retrieve from input first.
          const value = (init as any)?.[field]
          return value || (isRequestInput ? (input as any)[field] : null)
        }

        // If the staticGenerationStore is not available, we can't do any
        // special treatment of fetch, therefore fallback to the original
        // fetch implementation.
        if (
          !staticGenerationStore ||
          isInternal ||
          staticGenerationStore.isDraftMode
        ) {
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
        const tags: string[] = validateTags(
          getNextField('tags') || [],
          `fetch ${input.toString()}`
        )

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

        const fetchCacheMode = staticGenerationStore.fetchCache
        const isUsingNoStore = !!staticGenerationStore.isUnstableNoStore

        let _cache = getRequestMeta('cache')
        let cacheReason = ''

        if (
          typeof _cache === 'string' &&
          typeof curRevalidate !== 'undefined'
        ) {
          // when providing fetch with a Request input, it'll automatically set a cache value of 'default'
          // we only want to warn if the user is explicitly setting a cache value
          if (!(isRequestInput && _cache === 'default')) {
            Log.warn(
              `fetch for ${fetchUrl} on ${staticGenerationStore.urlPathname} specified "cache: ${_cache}" and "revalidate: ${curRevalidate}", only one should be specified.`
            )
          }
          _cache = undefined
        }

        if (_cache === 'force-cache') {
          curRevalidate = false
        } else if (
          _cache === 'no-cache' ||
          _cache === 'no-store' ||
          fetchCacheMode === 'force-no-store' ||
          fetchCacheMode === 'only-no-store'
        ) {
          curRevalidate = 0
        }

        if (_cache === 'no-cache' || _cache === 'no-store') {
          cacheReason = `cache: ${_cache}`
        }

        revalidate = validateRevalidate(
          curRevalidate,
          staticGenerationStore.urlPathname
        )

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

        switch (fetchCacheMode) {
          case 'force-no-store': {
            cacheReason = 'fetchCache = force-no-store'
            break
          }
          case 'only-no-store': {
            if (
              _cache === 'force-cache' ||
              (typeof revalidate !== 'undefined' &&
                (revalidate === false || revalidate > 0))
            ) {
              throw new Error(
                `cache: 'force-cache' used on fetch for ${fetchUrl} with 'export const fetchCache = 'only-no-store'`
              )
            }
            cacheReason = 'fetchCache = only-no-store'
            break
          }
          case 'only-cache': {
            if (_cache === 'no-store') {
              throw new Error(
                `cache: 'no-store' used on fetch for ${fetchUrl} with 'export const fetchCache = 'only-cache'`
              )
            }
            break
          }
          case 'force-cache': {
            if (typeof curRevalidate === 'undefined' || curRevalidate === 0) {
              cacheReason = 'fetchCache = force-cache'
              revalidate = false
            }
            break
          }
          default:
          // sometimes we won't match the above cases. the reason we don't move
          // everything to this switch is the use of autoNoCache which is not a fetchCacheMode
          // I suspect this could be unified with fetchCacheMode however in which case we could
          // simplify the switch case and ensure we have an exhaustive switch handling all modes
        }

        if (typeof revalidate === 'undefined') {
          if (fetchCacheMode === 'default-cache') {
            revalidate = false
            cacheReason = 'fetchCache = default-cache'
          } else if (autoNoCache) {
            revalidate = 0
            cacheReason = 'auto no cache'
          } else if (fetchCacheMode === 'default-no-store') {
            revalidate = 0
            cacheReason = 'fetchCache = default-no-store'
          } else if (isUsingNoStore) {
            revalidate = 0
            cacheReason = 'noStore call'
          } else {
            cacheReason = 'auto cache'
            revalidate =
              typeof staticGenerationStore.revalidate === 'boolean' ||
              typeof staticGenerationStore.revalidate === 'undefined'
                ? false
                : staticGenerationStore.revalidate
          }
        } else if (!cacheReason) {
          cacheReason = `revalidate: ${revalidate}`
        }

        if (
          // when force static is configured we don't bail from
          // `revalidate: 0` values
          !(staticGenerationStore.forceStatic && revalidate === 0) &&
          // we don't consider autoNoCache to switch to dynamic during
          // revalidate although if it occurs during build we do
          !autoNoCache &&
          // If the revalidate value isn't currently set or the value is less
          // than the current revalidate value, we should update the revalidate
          // value.
          (typeof staticGenerationStore.revalidate === 'undefined' ||
            (typeof revalidate === 'number' &&
              (staticGenerationStore.revalidate === false ||
                (typeof staticGenerationStore.revalidate === 'number' &&
                  revalidate < staticGenerationStore.revalidate))))
        ) {
          // If we were setting the revalidate value to 0, we should try to
          // postpone instead first.
          if (revalidate === 0) {
            trackDynamicFetch(staticGenerationStore, 'revalidate: 0')
          }

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
                fetchUrl,
                isRequestInput ? (input as RequestInit) : init
              )
          } catch (err) {
            console.error(`Failed to generate cache key for`, input)
          }
        }

        const fetchIdx = staticGenerationStore.nextFetchId ?? 1
        staticGenerationStore.nextFetchId = fetchIdx + 1

        const normalizedRevalidate =
          typeof revalidate !== 'number' ? CACHE_ONE_YEAR : revalidate

        const doOriginalFetch = async (
          isStale?: boolean,
          cacheReasonOverride?: string
        ) => {
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
            'window',
            'duplex',

            // don't pass through signal when revalidating
            ...(isStale ? [] : ['signal']),
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
            const { _ogBody, body, signal, ...otherInput } =
              init as RequestInit & { _ogBody?: any }
            init = {
              ...otherInput,
              body: _ogBody || body,
              signal: isStale ? undefined : signal,
            }
          }

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
                cacheReason: cacheReasonOverride || cacheReason,
                cacheStatus:
                  revalidate === 0 || cacheReasonOverride ? 'skip' : 'miss',
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
                      url: res.url,
                    },
                    revalidate: normalizedRevalidate,
                  },
                  {
                    fetchCache: true,
                    revalidate,
                    fetchUrl,
                    fetchIdx,
                    tags,
                  }
                )
              } catch (err) {
                console.warn(`Failed to set fetch cache`, input, err)
              }

              const response = new Response(bodyBuffer, {
                headers: new Headers(res.headers),
                status: res.status,
              })
              Object.defineProperty(response, 'url', { value: res.url })
              return response
            }
            return res
          })
        }

        let handleUnlock = () => Promise.resolve()
        let cacheReasonOverride

        if (cacheKey && staticGenerationStore.incrementalCache) {
          handleUnlock = await staticGenerationStore.incrementalCache.lock(
            cacheKey
          )

          const entry = staticGenerationStore.isOnDemandRevalidate
            ? null
            : await staticGenerationStore.incrementalCache.get(cacheKey, {
                kindHint: 'fetch',
                revalidate,
                fetchUrl,
                fetchIdx,
                tags,
                softTags: implicitTags,
              })

          if (entry) {
            await handleUnlock()
          } else {
            // in dev, incremental cache response will be null in case the browser adds `cache-control: no-cache` in the request headers
            cacheReasonOverride = 'cache-control: no-cache (hard refresh)'
          }

          if (entry?.value && entry.value.kind === 'FETCH') {
            // when stale and is revalidating we wait for fresh data
            // so the revalidated entry has the updated data
            if (!(staticGenerationStore.isRevalidate && entry.isStale)) {
              if (entry.isStale) {
                staticGenerationStore.pendingRevalidates ??= {}
                if (!staticGenerationStore.pendingRevalidates[cacheKey]) {
                  staticGenerationStore.pendingRevalidates[cacheKey] =
                    doOriginalFetch(true).catch(console.error)
                }
              }
              const resData = entry.value.data

              trackFetchMetric(staticGenerationStore, {
                start: fetchStart,
                url: fetchUrl,
                cacheReason,
                cacheStatus: 'hit',
                status: resData.status || 200,
                method: init?.method || 'GET',
              })

              const response = new Response(
                Buffer.from(resData.body, 'base64'),
                {
                  headers: resData.headers,
                  status: resData.status,
                }
              )
              Object.defineProperty(response, 'url', {
                value: entry.value.data.url,
              })
              return response
            }
          }
        }

        if (
          staticGenerationStore.isStaticGeneration &&
          init &&
          typeof init === 'object'
        ) {
          const { cache } = init

          // Delete `cache` property as Cloudflare Workers will throw an error
          if (isEdgeRuntime) delete init.cache

          if (!staticGenerationStore.forceStatic && cache === 'no-store') {
            const dynamicUsageReason = `no-store fetch ${input}${
              staticGenerationStore.urlPathname
                ? ` ${staticGenerationStore.urlPathname}`
                : ''
            }`

            // If enabled, we should bail out of static generation.
            trackDynamicFetch(staticGenerationStore, dynamicUsageReason)

            // PPR is not enabled, or React postpone is not available, we
            // should set the revalidate to 0.
            staticGenerationStore.revalidate = 0

            const err = new DynamicServerError(dynamicUsageReason)
            staticGenerationStore.dynamicUsageErr = err
            staticGenerationStore.dynamicUsageDescription = dynamicUsageReason
          }

          const hasNextConfig = 'next' in init
          const { next = {} } = init
          if (
            typeof next.revalidate === 'number' &&
            (typeof staticGenerationStore.revalidate === 'undefined' ||
              (typeof staticGenerationStore.revalidate === 'number' &&
                next.revalidate < staticGenerationStore.revalidate))
          ) {
            if (
              !staticGenerationStore.forceDynamic &&
              !staticGenerationStore.forceStatic &&
              next.revalidate === 0
            ) {
              const dynamicUsageReason = `revalidate: 0 fetch ${input}${
                staticGenerationStore.urlPathname
                  ? ` ${staticGenerationStore.urlPathname}`
                  : ''
              }`

              // If enabled, we should bail out of static generation.
              trackDynamicFetch(staticGenerationStore, dynamicUsageReason)

              const err = new DynamicServerError(dynamicUsageReason)
              staticGenerationStore.dynamicUsageErr = err
              staticGenerationStore.dynamicUsageDescription = dynamicUsageReason
            }

            if (!staticGenerationStore.forceStatic || next.revalidate !== 0) {
              staticGenerationStore.revalidate = next.revalidate
            }
          }
          if (hasNextConfig) delete init.next
        }

        return doOriginalFetch(false, cacheReasonOverride).finally(handleUnlock)
      }
    )
  }
  ;(globalThis.fetch as any).__nextGetStaticStore = () => {
    return staticGenerationAsyncStorage
  }
  ;(globalThis.fetch as any).__nextPatched = true
}
