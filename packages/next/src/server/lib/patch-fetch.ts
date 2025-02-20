import type {
  WorkAsyncStorage,
  WorkStore,
} from '../app-render/work-async-storage.external'

import { AppRenderSpan, NextNodeServerSpan } from './trace/constants'
import { getTracer, SpanKind } from './trace/tracer'
import {
  CACHE_ONE_YEAR,
  INFINITE_CACHE,
  NEXT_CACHE_TAG_MAX_ITEMS,
  NEXT_CACHE_TAG_MAX_LENGTH,
} from '../../lib/constants'
import { markCurrentScopeAsDynamic } from '../app-render/dynamic-rendering'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import type { FetchMetric } from '../base-http'
import { createDedupeFetch } from './dedupe-fetch'
import type { WorkUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedFetchData,
} from '../response-cache'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import { cloneResponse } from './clone-response'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

type Fetcher = typeof fetch

type PatchedFetcher = Fetcher & {
  readonly __nextPatched: true
  readonly __nextGetStaticStore: () => WorkAsyncStorage
  readonly _nextOriginalFetch: Fetcher
}

export const NEXT_PATCH_SYMBOL = Symbol.for('next-patch')

function isFetchPatched() {
  return (globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] === true
}

export function validateRevalidate(
  revalidateVal: unknown,
  route: string
): undefined | number {
  try {
    let normalizedRevalidate: number | undefined = undefined

    if (revalidateVal === false) {
      normalizedRevalidate = INFINITE_CACHE
    } else if (
      typeof revalidateVal === 'number' &&
      !isNaN(revalidateVal) &&
      revalidateVal > -1
    ) {
      normalizedRevalidate = revalidateVal
    } else if (typeof revalidateVal !== 'undefined') {
      throw new Error(
        `Invalid revalidate value "${revalidateVal}" on "${route}", must be a non-negative number or false`
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

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]

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

    if (validTags.length > NEXT_CACHE_TAG_MAX_ITEMS) {
      console.warn(
        `Warning: exceeded max tag count for ${description}, dropped tags:`,
        tags.slice(i).join(', ')
      )
      break
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

function trackFetchMetric(
  workStore: WorkStore,
  ctx: Omit<FetchMetric, 'end' | 'idx'>
) {
  // If the static generation store is not available, we can't track the fetch
  if (!workStore) return
  if (workStore.requestEndedState?.ended) return

  const isDebugBuild =
    (!!process.env.NEXT_DEBUG_BUILD ||
      process.env.NEXT_SSG_FETCH_METRICS === '1') &&
    workStore.isStaticGeneration
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (
    // The only time we want to track fetch metrics outside of development is when
    // we are performing a static generation & we are in debug mode.
    !isDebugBuild &&
    !isDevelopment
  ) {
    return
  }

  workStore.fetchMetrics ??= []

  workStore.fetchMetrics.push({
    ...ctx,
    end: performance.timeOrigin + performance.now(),
    idx: workStore.nextFetchId || 0,
  })
}

interface PatchableModule {
  workAsyncStorage: WorkAsyncStorage
  workUnitAsyncStorage: WorkUnitAsyncStorage
}

export function createPatchedFetcher(
  originFetch: Fetcher,
  { workAsyncStorage, workUnitAsyncStorage }: PatchableModule
): PatchedFetcher {
  // Create the patched fetch function. We don't set the type here, as it's
  // verified as the return value of this function.
  const patched = async (
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
    const method = init?.method?.toUpperCase() || 'GET'

    // Do create a new span trace for internal fetches in the
    // non-verbose mode.
    const isInternal = (init?.next as any)?.internal === true
    const hideSpan = process.env.NEXT_OTEL_FETCH_DISABLED === '1'
    // We don't track fetch metrics for internal fetches
    // so it's not critical that we have a start time, as it won't be recorded.
    // This is to workaround a flaky issue where performance APIs might
    // not be available and will require follow-up investigation.
    const fetchStart: number | undefined = isInternal
      ? undefined
      : performance.timeOrigin + performance.now()

    const workStore = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()

    // During static generation we track cache reads so we can reason about when they fill
    let cacheSignal =
      workUnitStore && workUnitStore.type === 'prerender'
        ? workUnitStore.cacheSignal
        : null
    if (cacheSignal) {
      cacheSignal.beginRead()
    }

    const result = getTracer().trace(
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
        // If this is an internal fetch, we should not do any special treatment.
        if (isInternal) {
          return originFetch(input, init)
        }

        // If the workStore is not available, we can't do any
        // special treatment of fetch, therefore fallback to the original
        // fetch implementation.
        if (!workStore) {
          return originFetch(input, init)
        }

        // We should also fallback to the original fetch implementation if we
        // are in draft mode, it does not constitute a static generation.
        if (workStore.isDraftMode) {
          return originFetch(input, init)
        }

        const isRequestInput =
          input &&
          typeof input === 'object' &&
          typeof (input as Request).method === 'string'

        const getRequestMeta = (field: string) => {
          // If request input is present but init is not, retrieve from input first.
          const value = (init as any)?.[field]
          return value || (isRequestInput ? (input as any)[field] : null)
        }

        let finalRevalidate: number | undefined = undefined
        const getNextField = (field: 'revalidate' | 'tags') => {
          return typeof init?.next?.[field] !== 'undefined'
            ? init?.next?.[field]
            : isRequestInput
              ? (input as any).next?.[field]
              : undefined
        }
        // RequestInit doesn't keep extra fields e.g. next so it's
        // only available if init is used separate
        let currentFetchRevalidate = getNextField('revalidate')
        const tags: string[] = validateTags(
          getNextField('tags') || [],
          `fetch ${input.toString()}`
        )

        const revalidateStore =
          workUnitStore &&
          (workUnitStore.type === 'cache' ||
            workUnitStore.type === 'prerender' ||
            workUnitStore.type === 'prerender-ppr' ||
            workUnitStore.type === 'prerender-legacy')
            ? workUnitStore
            : undefined

        if (revalidateStore) {
          if (Array.isArray(tags)) {
            // Collect tags onto parent caches or parent prerenders.
            const collectedTags =
              revalidateStore.tags ?? (revalidateStore.tags = [])
            for (const tag of tags) {
              if (!collectedTags.includes(tag)) {
                collectedTags.push(tag)
              }
            }
          }
        }

        const implicitTags =
          !workUnitStore || workUnitStore.type === 'unstable-cache'
            ? []
            : workUnitStore.implicitTags

        // Inside unstable-cache we treat it the same as force-no-store on the
        // page.
        const pageFetchCacheMode =
          workUnitStore && workUnitStore.type === 'unstable-cache'
            ? 'force-no-store'
            : workStore.fetchCache

        const isUsingNoStore = !!workStore.isUnstableNoStore

        let currentFetchCacheConfig = getRequestMeta('cache')
        let cacheReason = ''
        let cacheWarning: string | undefined

        if (
          typeof currentFetchCacheConfig === 'string' &&
          typeof currentFetchRevalidate !== 'undefined'
        ) {
          // If the revalidate value conflicts with the cache value, we should warn the user and unset the conflicting values.
          const isConflictingRevalidate =
            // revalidate: 0 and cache: force-cache
            (currentFetchCacheConfig === 'force-cache' &&
              currentFetchRevalidate === 0) ||
            // revalidate: >0 or revalidate: false and cache: no-store
            (currentFetchCacheConfig === 'no-store' &&
              (currentFetchRevalidate > 0 || currentFetchRevalidate === false))

          if (isConflictingRevalidate) {
            cacheWarning = `Specified "cache: ${currentFetchCacheConfig}" and "revalidate: ${currentFetchRevalidate}", only one should be specified.`
            currentFetchCacheConfig = undefined
            currentFetchRevalidate = undefined
          }
        }

        const hasExplicitFetchCacheOptOut =
          // fetch config itself signals not to cache
          currentFetchCacheConfig === 'no-cache' ||
          currentFetchCacheConfig === 'no-store' ||
          // the fetch isn't explicitly caching and the segment level cache config signals not to cache
          // note: `pageFetchCacheMode` is also set by being in an unstable_cache context.
          pageFetchCacheMode === 'force-no-store' ||
          pageFetchCacheMode === 'only-no-store'

        // If no explicit fetch cache mode is set, but dynamic = `force-dynamic` is set,
        // we shouldn't consider caching the fetch. This is because the `dynamic` cache
        // is considered a "top-level" cache mode, whereas something like `fetchCache` is more
        // fine-grained. Top-level modes are responsible for setting reasonable defaults for the
        // other configurations.
        const noFetchConfigAndForceDynamic =
          !pageFetchCacheMode &&
          !currentFetchCacheConfig &&
          !currentFetchRevalidate &&
          workStore.forceDynamic

        if (
          // force-cache was specified without a revalidate value. We set the revalidate value to false
          // which will signal the cache to not revalidate
          currentFetchCacheConfig === 'force-cache' &&
          typeof currentFetchRevalidate === 'undefined'
        ) {
          currentFetchRevalidate = false
        } else if (
          // if we are inside of "use cache"/"unstable_cache"
          // we shouldn't set the revalidate to 0 as it's overridden
          // by the cache context
          workUnitStore?.type !== 'cache' &&
          (hasExplicitFetchCacheOptOut || noFetchConfigAndForceDynamic)
        ) {
          currentFetchRevalidate = 0
        }

        if (
          currentFetchCacheConfig === 'no-cache' ||
          currentFetchCacheConfig === 'no-store'
        ) {
          cacheReason = `cache: ${currentFetchCacheConfig}`
        }

        finalRevalidate = validateRevalidate(
          currentFetchRevalidate,
          workStore.route
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

        /**
         * We automatically disable fetch caching under the following conditions:
         * - Fetch cache configs are not set. Specifically:
         *    - A page fetch cache mode is not set (export const fetchCache=...)
         *    - A fetch cache mode is not set in the fetch call (fetch(url, { cache: ... }))
         *      or the fetch cache mode is set to 'default'
         *    - A fetch revalidate value is not set in the fetch call (fetch(url, { revalidate: ... }))
         * - OR the fetch comes after a configuration that triggered dynamic rendering (e.g., reading cookies())
         *   and the fetch was considered uncacheable (e.g., POST method or has authorization headers)
         */
        const hasNoExplicitCacheConfig =
          // eslint-disable-next-line eqeqeq
          pageFetchCacheMode == undefined &&
          // eslint-disable-next-line eqeqeq
          (currentFetchCacheConfig == undefined ||
            // when considering whether to opt into the default "no-cache" fetch semantics,
            // a "default" cache config should be treated the same as no cache config
            currentFetchCacheConfig === 'default') &&
          // eslint-disable-next-line eqeqeq
          currentFetchRevalidate == undefined
        const autoNoCache =
          // this condition is hit for null/undefined
          // eslint-disable-next-line eqeqeq
          (hasNoExplicitCacheConfig &&
            // we disable automatic no caching behavior during build time SSG so that we can still
            // leverage the fetch cache between SSG workers
            !workStore.isPrerendering) ||
          ((hasUnCacheableHeader || isUnCacheableMethod) &&
            revalidateStore &&
            revalidateStore.revalidate === 0)

        if (
          hasNoExplicitCacheConfig &&
          workUnitStore !== undefined &&
          workUnitStore.type === 'prerender'
        ) {
          // If we have no cache config, and we're in Dynamic I/O prerendering, it'll be a dynamic call.
          // We don't have to issue that dynamic call.
          if (cacheSignal) {
            cacheSignal.endRead()
            cacheSignal = null
          }
          return makeHangingPromise<Response>(
            workUnitStore.renderSignal,
            'fetch()'
          )
        }

        switch (pageFetchCacheMode) {
          case 'force-no-store': {
            cacheReason = 'fetchCache = force-no-store'
            break
          }
          case 'only-no-store': {
            if (
              currentFetchCacheConfig === 'force-cache' ||
              (typeof finalRevalidate !== 'undefined' && finalRevalidate > 0)
            ) {
              throw new Error(
                `cache: 'force-cache' used on fetch for ${fetchUrl} with 'export const fetchCache = 'only-no-store'`
              )
            }
            cacheReason = 'fetchCache = only-no-store'
            break
          }
          case 'only-cache': {
            if (currentFetchCacheConfig === 'no-store') {
              throw new Error(
                `cache: 'no-store' used on fetch for ${fetchUrl} with 'export const fetchCache = 'only-cache'`
              )
            }
            break
          }
          case 'force-cache': {
            if (
              typeof currentFetchRevalidate === 'undefined' ||
              currentFetchRevalidate === 0
            ) {
              cacheReason = 'fetchCache = force-cache'
              finalRevalidate = INFINITE_CACHE
            }
            break
          }
          default:
          // sometimes we won't match the above cases. the reason we don't move
          // everything to this switch is the use of autoNoCache which is not a fetchCacheMode
          // I suspect this could be unified with fetchCacheMode however in which case we could
          // simplify the switch case and ensure we have an exhaustive switch handling all modes
        }

        if (typeof finalRevalidate === 'undefined') {
          if (pageFetchCacheMode === 'default-cache' && !isUsingNoStore) {
            finalRevalidate = INFINITE_CACHE
            cacheReason = 'fetchCache = default-cache'
          } else if (pageFetchCacheMode === 'default-no-store') {
            finalRevalidate = 0
            cacheReason = 'fetchCache = default-no-store'
          } else if (isUsingNoStore) {
            finalRevalidate = 0
            cacheReason = 'noStore call'
          } else if (autoNoCache) {
            finalRevalidate = 0
            cacheReason = 'auto no cache'
          } else {
            // TODO: should we consider this case an invariant?
            cacheReason = 'auto cache'
            finalRevalidate = revalidateStore
              ? revalidateStore.revalidate
              : INFINITE_CACHE
          }
        } else if (!cacheReason) {
          cacheReason = `revalidate: ${finalRevalidate}`
        }

        if (
          // when force static is configured we don't bail from
          // `revalidate: 0` values
          !(workStore.forceStatic && finalRevalidate === 0) &&
          // we don't consider autoNoCache to switch to dynamic for ISR
          !autoNoCache &&
          // If the revalidate value isn't currently set or the value is less
          // than the current revalidate value, we should update the revalidate
          // value.
          revalidateStore &&
          finalRevalidate < revalidateStore.revalidate
        ) {
          // If we were setting the revalidate value to 0, we should try to
          // postpone instead first.
          if (finalRevalidate === 0) {
            if (workUnitStore && workUnitStore.type === 'prerender') {
              if (cacheSignal) {
                cacheSignal.endRead()
                cacheSignal = null
              }
              return makeHangingPromise<Response>(
                workUnitStore.renderSignal,
                'fetch()'
              )
            } else {
              markCurrentScopeAsDynamic(
                workStore,
                workUnitStore,
                `revalidate: 0 fetch ${input} ${workStore.route}`
              )
            }
          }

          // We only want to set the revalidate store's revalidate time if it
          // was explicitly set for the fetch call, i.e. currentFetchRevalidate.
          if (revalidateStore && currentFetchRevalidate === finalRevalidate) {
            revalidateStore.revalidate = finalRevalidate
          }
        }

        const isCacheableRevalidate =
          typeof finalRevalidate === 'number' && finalRevalidate > 0

        let cacheKey: string | undefined
        const { incrementalCache } = workStore

        const useCacheOrRequestStore =
          workUnitStore?.type === 'request' || workUnitStore?.type === 'cache'
            ? workUnitStore
            : undefined

        if (
          incrementalCache &&
          (isCacheableRevalidate ||
            useCacheOrRequestStore?.serverComponentsHmrCache)
        ) {
          try {
            cacheKey = await incrementalCache.generateCacheKey(
              fetchUrl,
              isRequestInput ? (input as RequestInit) : init
            )
          } catch (err) {
            console.error(`Failed to generate cache key for`, input)
          }
        }

        const fetchIdx = workStore.nextFetchId ?? 1
        workStore.nextFetchId = fetchIdx + 1

        let handleUnlock = () => Promise.resolve()

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

          return originFetch(input, clonedInit)
            .then(async (res) => {
              if (!isStale && fetchStart) {
                trackFetchMetric(workStore, {
                  start: fetchStart,
                  url: fetchUrl,
                  cacheReason: cacheReasonOverride || cacheReason,
                  cacheStatus:
                    finalRevalidate === 0 || cacheReasonOverride
                      ? 'skip'
                      : 'miss',
                  cacheWarning,
                  status: res.status,
                  method: clonedInit.method || 'GET',
                })
              }
              if (
                res.status === 200 &&
                incrementalCache &&
                cacheKey &&
                (isCacheableRevalidate ||
                  useCacheOrRequestStore?.serverComponentsHmrCache)
              ) {
                const normalizedRevalidate =
                  finalRevalidate >= INFINITE_CACHE
                    ? CACHE_ONE_YEAR
                    : finalRevalidate
                const externalRevalidate =
                  finalRevalidate >= INFINITE_CACHE ? false : finalRevalidate

                if (workUnitStore && workUnitStore.type === 'prerender') {
                  // We are prerendering at build time or revalidate time with dynamicIO so we need to
                  // buffer the response so we can guarantee it can be read in a microtask
                  const bodyBuffer = await res.arrayBuffer()

                  const fetchedData = {
                    headers: Object.fromEntries(res.headers.entries()),
                    body: Buffer.from(bodyBuffer).toString('base64'),
                    status: res.status,
                    url: res.url,
                  }

                  // We can skip checking the serverComponentsHmrCache because we aren't in
                  // dev mode.

                  await incrementalCache.set(
                    cacheKey,
                    {
                      kind: CachedRouteKind.FETCH,
                      data: fetchedData,
                      revalidate: normalizedRevalidate,
                    },
                    {
                      fetchCache: true,
                      revalidate: externalRevalidate,
                      fetchUrl,
                      fetchIdx,
                      tags,
                    }
                  )
                  await handleUnlock()

                  // We return a new Response to the caller.
                  return new Response(bodyBuffer, {
                    headers: res.headers,
                    status: res.status,
                    statusText: res.statusText,
                  })
                } else {
                  // We're cloning the response using this utility because there
                  // exists a bug in the undici library around response cloning.
                  // See the following pull request for more details:
                  // https://github.com/vercel/next.js/pull/73274

                  const [cloned1, cloned2] = cloneResponse(res)

                  // We are dynamically rendering including dev mode. We want to return
                  // the response to the caller as soon as possible because it might stream
                  // over a very long time.
                  cloned1
                    .arrayBuffer()
                    .then(async (arrayBuffer) => {
                      const bodyBuffer = Buffer.from(arrayBuffer)

                      const fetchedData = {
                        headers: Object.fromEntries(cloned1.headers.entries()),
                        body: bodyBuffer.toString('base64'),
                        status: cloned1.status,
                        url: cloned1.url,
                      }

                      useCacheOrRequestStore?.serverComponentsHmrCache?.set(
                        cacheKey,
                        fetchedData
                      )

                      if (isCacheableRevalidate) {
                        await incrementalCache.set(
                          cacheKey,
                          {
                            kind: CachedRouteKind.FETCH,
                            data: fetchedData,
                            revalidate: normalizedRevalidate,
                          },
                          {
                            fetchCache: true,
                            revalidate: externalRevalidate,
                            fetchUrl,
                            fetchIdx,
                            tags,
                          }
                        )
                      }
                    })
                    .catch((error) =>
                      console.warn(`Failed to set fetch cache`, input, error)
                    )
                    .finally(handleUnlock)

                  return cloned2
                }
              }

              // we had response that we determined shouldn't be cached so we return it
              // and don't cache it. This also needs to unlock the cache lock we acquired.
              await handleUnlock()

              return res
            })
            .catch((error) => {
              handleUnlock()
              throw error
            })
        }

        let cacheReasonOverride
        let isForegroundRevalidate = false
        let isHmrRefreshCache = false

        if (cacheKey && incrementalCache) {
          let cachedFetchData: CachedFetchData | undefined

          if (
            useCacheOrRequestStore?.isHmrRefresh &&
            useCacheOrRequestStore.serverComponentsHmrCache
          ) {
            cachedFetchData =
              useCacheOrRequestStore.serverComponentsHmrCache.get(cacheKey)

            isHmrRefreshCache = true
          }

          if (isCacheableRevalidate && !cachedFetchData) {
            handleUnlock = await incrementalCache.lock(cacheKey)
            const entry = workStore.isOnDemandRevalidate
              ? null
              : await incrementalCache.get(cacheKey, {
                  kind: IncrementalCacheKind.FETCH,
                  revalidate: finalRevalidate,
                  fetchUrl,
                  fetchIdx,
                  tags,
                  softTags: implicitTags,
                  isFallback: false,
                })

            if (hasNoExplicitCacheConfig) {
              // We sometimes use the cache to dedupe fetches that do not specify a cache configuration
              // In these cases we want to make sure we still exclude them from prerenders if dynamicIO is on
              // so we introduce an artificial Task boundary here.
              if (workUnitStore && workUnitStore.type === 'prerender') {
                await waitAtLeastOneReactRenderTask()
              }
            }

            if (entry) {
              await handleUnlock()
            } else {
              // in dev, incremental cache response will be null in case the browser adds `cache-control: no-cache` in the request headers
              cacheReasonOverride = 'cache-control: no-cache (hard refresh)'
            }

            if (entry?.value && entry.value.kind === CachedRouteKind.FETCH) {
              // when stale and is revalidating we wait for fresh data
              // so the revalidated entry has the updated data
              if (workStore.isRevalidate && entry.isStale) {
                isForegroundRevalidate = true
              } else {
                if (entry.isStale) {
                  workStore.pendingRevalidates ??= {}
                  if (!workStore.pendingRevalidates[cacheKey]) {
                    const pendingRevalidate = doOriginalFetch(true)
                      .then(async (response) => ({
                        body: await response.arrayBuffer(),
                        headers: response.headers,
                        status: response.status,
                        statusText: response.statusText,
                      }))
                      .finally(() => {
                        workStore.pendingRevalidates ??= {}
                        delete workStore.pendingRevalidates[cacheKey || '']
                      })

                    // Attach the empty catch here so we don't get a "unhandled
                    // promise rejection" warning.
                    pendingRevalidate.catch(console.error)

                    workStore.pendingRevalidates[cacheKey] = pendingRevalidate
                  }
                }

                cachedFetchData = entry.value.data
              }
            }
          }

          if (cachedFetchData) {
            if (fetchStart) {
              trackFetchMetric(workStore, {
                start: fetchStart,
                url: fetchUrl,
                cacheReason,
                cacheStatus: isHmrRefreshCache ? 'hmr' : 'hit',
                cacheWarning,
                status: cachedFetchData.status || 200,
                method: init?.method || 'GET',
              })
            }

            const response = new Response(
              Buffer.from(cachedFetchData.body, 'base64'),
              {
                headers: cachedFetchData.headers,
                status: cachedFetchData.status,
              }
            )

            Object.defineProperty(response, 'url', {
              value: cachedFetchData.url,
            })

            return response
          }
        }

        if (workStore.isStaticGeneration && init && typeof init === 'object') {
          const { cache } = init

          // Delete `cache` property as Cloudflare Workers will throw an error
          if (isEdgeRuntime) delete init.cache

          if (cache === 'no-store') {
            // If enabled, we should bail out of static generation.
            if (workUnitStore && workUnitStore.type === 'prerender') {
              if (cacheSignal) {
                cacheSignal.endRead()
                cacheSignal = null
              }
              return makeHangingPromise<Response>(
                workUnitStore.renderSignal,
                'fetch()'
              )
            } else {
              markCurrentScopeAsDynamic(
                workStore,
                workUnitStore,
                `no-store fetch ${input} ${workStore.route}`
              )
            }
          }

          const hasNextConfig = 'next' in init
          const { next = {} } = init
          if (
            typeof next.revalidate === 'number' &&
            revalidateStore &&
            next.revalidate < revalidateStore.revalidate
          ) {
            if (next.revalidate === 0) {
              // If enabled, we should bail out of static generation.
              if (workUnitStore && workUnitStore.type === 'prerender') {
                return makeHangingPromise<Response>(
                  workUnitStore.renderSignal,
                  'fetch()'
                )
              } else {
                markCurrentScopeAsDynamic(
                  workStore,
                  workUnitStore,
                  `revalidate: 0 fetch ${input} ${workStore.route}`
                )
              }
            }

            if (!workStore.forceStatic || next.revalidate !== 0) {
              revalidateStore.revalidate = next.revalidate
            }
          }
          if (hasNextConfig) delete init.next
        }

        // if we are revalidating the whole page via time or on-demand and
        // the fetch cache entry is stale we should still de-dupe the
        // origin hit if it's a cache-able entry
        if (cacheKey && isForegroundRevalidate) {
          const pendingRevalidateKey = cacheKey
          workStore.pendingRevalidates ??= {}
          let pendingRevalidate =
            workStore.pendingRevalidates[pendingRevalidateKey]

          if (pendingRevalidate) {
            const revalidatedResult: {
              body: ArrayBuffer
              headers: Headers
              status: number
              statusText: string
            } = await pendingRevalidate
            return new Response(revalidatedResult.body, {
              headers: revalidatedResult.headers,
              status: revalidatedResult.status,
              statusText: revalidatedResult.statusText,
            })
          }

          // We used to just resolve the Response and clone it however for
          // static generation with dynamicIO we need the response to be able to
          // be resolved in a microtask and cloning the response will never have
          // a body that can resolve in a microtask in node (as observed through
          // experimentation) So instead we await the body and then when it is
          // available we construct manually cloned Response objects with the
          // body as an ArrayBuffer. This will be resolvable in a microtask
          // making it compatible with dynamicIO.
          const pendingResponse = doOriginalFetch(true, cacheReasonOverride)
            // We're cloning the response using this utility because there
            // exists a bug in the undici library around response cloning.
            // See the following pull request for more details:
            // https://github.com/vercel/next.js/pull/73274
            .then(cloneResponse)

          pendingRevalidate = pendingResponse
            .then(async (responses) => {
              const response = responses[0]
              return {
                body: await response.arrayBuffer(),
                headers: response.headers,
                status: response.status,
                statusText: response.statusText,
              }
            })
            .finally(() => {
              // If the pending revalidate is not present in the store, then
              // we have nothing to delete.
              if (!workStore.pendingRevalidates?.[pendingRevalidateKey]) {
                return
              }

              delete workStore.pendingRevalidates[pendingRevalidateKey]
            })

          // Attach the empty catch here so we don't get a "unhandled promise
          // rejection" warning
          pendingRevalidate.catch(() => {})

          workStore.pendingRevalidates[pendingRevalidateKey] = pendingRevalidate

          return pendingResponse.then((responses) => responses[1])
        } else {
          return doOriginalFetch(false, cacheReasonOverride)
        }
      }
    )

    if (cacheSignal) {
      try {
        return await result
      } finally {
        if (cacheSignal) {
          cacheSignal.endRead()
        }
      }
    }
    return result
  }

  // Attach the necessary properties to the patched fetch function.
  // We don't use this to determine if the fetch function has been patched,
  // but for external consumers to determine if the fetch function has been
  // patched.
  patched.__nextPatched = true as const
  patched.__nextGetStaticStore = () => workAsyncStorage
  patched._nextOriginalFetch = originFetch
  ;(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = true

  return patched
}
// we patch fetch to collect cache information used for
// determining if a page is static or not
export function patchFetch(options: PatchableModule) {
  // If we've already patched fetch, we should not patch it again.
  if (isFetchPatched()) return

  // Grab the original fetch function. We'll attach this so we can use it in
  // the patched fetch function.
  const original = createDedupeFetch(globalThis.fetch)

  // Set the global fetch to the patched fetch.
  globalThis.fetch = createPatchedFetcher(original, options)
}
