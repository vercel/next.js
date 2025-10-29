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
import {
  getCacheSignal,
  type RevalidateStore,
  type WorkUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedFetchData,
  type ServerComponentsHmrCache,
  type SetIncrementalFetchCacheContext,
} from '../response-cache'
import { cloneResponse } from './clone-response'
import type { IncrementalCache } from './incremental-cache'
import { RenderStage } from '../app-render/staged-rendering'

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
  if (!workStore.shouldTrackFetchMetrics) {
    return
  }

  workStore.fetchMetrics ??= []

  workStore.fetchMetrics.push({
    ...ctx,
    end: performance.timeOrigin + performance.now(),
    idx: workStore.nextFetchId || 0,
  })
}

async function createCachedPrerenderResponse(
  res: Response,
  cacheKey: string,
  incrementalCacheContext: SetIncrementalFetchCacheContext | undefined,
  incrementalCache: IncrementalCache,
  revalidate: number,
  handleUnlock: () => Promise<void> | void
): Promise<Response> {
  // We are prerendering at build time or revalidate time with cacheComponents so we
  // need to buffer the response so we can guarantee it can be read in a
  // microtask.
  const bodyBuffer = await res.arrayBuffer()

  const fetchedData = {
    headers: Object.fromEntries(res.headers.entries()),
    body: Buffer.from(bodyBuffer).toString('base64'),
    status: res.status,
    url: res.url,
  }

  // We can skip setting the serverComponentsHmrCache because we aren't in dev
  // mode.

  if (incrementalCacheContext) {
    await incrementalCache.set(
      cacheKey,
      { kind: CachedRouteKind.FETCH, data: fetchedData, revalidate },
      incrementalCacheContext
    )
  }

  await handleUnlock()

  // We return a new Response to the caller.
  return new Response(bodyBuffer, {
    headers: res.headers,
    status: res.status,
    statusText: res.statusText,
  })
}

async function createCachedDynamicResponse(
  workStore: WorkStore,
  res: Response,
  cacheKey: string,
  incrementalCacheContext: SetIncrementalFetchCacheContext | undefined,
  incrementalCache: IncrementalCache,
  serverComponentsHmrCache: ServerComponentsHmrCache | undefined,
  revalidate: number,
  input: RequestInfo | URL,
  handleUnlock: () => Promise<void> | void
): Promise<Response> {
  // We're cloning the response using this utility because there exists a bug in
  // the undici library around response cloning. See the following pull request
  // for more details: https://github.com/vercel/next.js/pull/73274
  const [cloned1, cloned2] = cloneResponse(res)

  // We are dynamically rendering including dev mode. We want to return the
  // response to the caller as soon as possible because it might stream over a
  // very long time.
  const cacheSetPromise = cloned1
    .arrayBuffer()
    .then(async (arrayBuffer) => {
      const bodyBuffer = Buffer.from(arrayBuffer)

      const fetchedData = {
        headers: Object.fromEntries(cloned1.headers.entries()),
        body: bodyBuffer.toString('base64'),
        status: cloned1.status,
        url: cloned1.url,
      }

      serverComponentsHmrCache?.set(cacheKey, fetchedData)

      if (incrementalCacheContext) {
        await incrementalCache.set(
          cacheKey,
          { kind: CachedRouteKind.FETCH, data: fetchedData, revalidate },
          incrementalCacheContext
        )
      }
    })
    .catch((error) => console.warn(`Failed to set fetch cache`, input, error))
    .finally(handleUnlock)

  const pendingRevalidateKey = `cache-set-${cacheKey}`
  workStore.pendingRevalidates ??= {}

  if (pendingRevalidateKey in workStore.pendingRevalidates) {
    // there is already a pending revalidate entry that we need to await to
    // avoid race conditions
    await workStore.pendingRevalidates[pendingRevalidateKey]
  }

  workStore.pendingRevalidates[pendingRevalidateKey] = cacheSetPromise.finally(
    () => {
      // If the pending revalidate is not present in the store, then we have
      // nothing to delete.
      if (!workStore.pendingRevalidates?.[pendingRevalidateKey]) {
        return
      }

      delete workStore.pendingRevalidates[pendingRevalidateKey]
    }
  )

  return cloned2
}

interface PatchableModule {
  workAsyncStorage: WorkAsyncStorage
  workUnitAsyncStorage: WorkUnitAsyncStorage
}

export function createPatchedFetcher(
  originFetch: Fetcher,
  { workAsyncStorage, workUnitAsyncStorage }: PatchableModule
): PatchedFetcher {
  // Create the patched fetch function.
  const patched = async function fetch(
    input: RequestInfo | URL,
    init: RequestInit | undefined
  ): Promise<Response> {
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

    let cacheSignal = workUnitStore ? getCacheSignal(workUnitStore) : null
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
        const originalFetchRevalidate = getNextField('revalidate')
        let currentFetchRevalidate = originalFetchRevalidate
        const tags: string[] = validateTags(
          getNextField('tags') || [],
          `fetch ${input.toString()}`
        )

        let revalidateStore: RevalidateStore | undefined

        if (workUnitStore) {
          switch (workUnitStore.type) {
            case 'prerender':
            case 'prerender-runtime':
            // TODO: Stop accumulating tags in client prerender. (fallthrough)
            case 'prerender-client':
            case 'prerender-ppr':
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
              revalidateStore = workUnitStore
              break
            case 'request':
            case 'unstable-cache':
              break
            default:
              workUnitStore satisfies never
          }
        }

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

        const implicitTags = workUnitStore?.implicitTags

        let pageFetchCacheMode = workStore.fetchCache

        if (workUnitStore) {
          switch (workUnitStore.type) {
            case 'unstable-cache':
              // Inside unstable-cache we treat it the same as force-no-store on
              // the page.
              pageFetchCacheMode = 'force-no-store'
              break
            case 'prerender':
            case 'prerender-client':
            case 'prerender-runtime':
            case 'prerender-ppr':
            case 'prerender-legacy':
            case 'request':
            case 'cache':
            case 'private-cache':
              break
            default:
              workUnitStore satisfies never
          }
        }

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
          hasExplicitFetchCacheOptOut ||
          noFetchConfigAndForceDynamic
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

        let autoNoCache = Boolean(
          (hasUnCacheableHeader || isUnCacheableMethod) &&
            revalidateStore?.revalidate === 0
        )

        let isImplicitBuildTimeCache = false

        if (!autoNoCache && hasNoExplicitCacheConfig) {
          // We don't enable automatic no-cache behavior during build-time
          // prerendering so that we can still leverage the fetch cache between
          // export workers.
          if (workStore.isBuildTimePrerendering) {
            isImplicitBuildTimeCache = true
          } else {
            autoNoCache = true
          }
        }

        // If we have no cache config, and we're in Dynamic I/O prerendering,
        // it'll be a dynamic call. We don't have to issue that dynamic call.
        if (hasNoExplicitCacheConfig && workUnitStore !== undefined) {
          switch (workUnitStore.type) {
            case 'prerender':
            case 'prerender-runtime':
            // While we don't want to do caching in the client scope we know the
            // fetch will be dynamic for cacheComponents so we may as well avoid the
            // call here. (fallthrough)
            case 'prerender-client':
              if (cacheSignal) {
                cacheSignal.endRead()
                cacheSignal = null
              }

              return makeHangingPromise<Response>(
                workUnitStore.renderSignal,
                workStore.route,
                'fetch()'
              )
            case 'request':
              if (
                process.env.NODE_ENV === 'development' &&
                workUnitStore.stagedRendering
              ) {
                if (cacheSignal) {
                  cacheSignal.endRead()
                  cacheSignal = null
                }
                await workUnitStore.stagedRendering.waitForStage(
                  RenderStage.Dynamic
                )
              }
              break
            case 'prerender-ppr':
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
              break
            default:
              workUnitStore satisfies never
          }
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
          case 'default-cache':
          case 'default-no-store':
          case 'auto':
          case undefined:
            // sometimes we won't match the above cases. the reason we don't move
            // everything to this switch is the use of autoNoCache which is not a fetchCacheMode
            // I suspect this could be unified with fetchCacheMode however in which case we could
            // simplify the switch case and ensure we have an exhaustive switch handling all modes
            break
          default:
            pageFetchCacheMode satisfies never
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
            if (workUnitStore) {
              switch (workUnitStore.type) {
                case 'prerender':
                case 'prerender-client':
                case 'prerender-runtime':
                  if (cacheSignal) {
                    cacheSignal.endRead()
                    cacheSignal = null
                  }
                  return makeHangingPromise<Response>(
                    workUnitStore.renderSignal,
                    workStore.route,
                    'fetch()'
                  )
                case 'request':
                  if (
                    process.env.NODE_ENV === 'development' &&
                    workUnitStore.stagedRendering
                  ) {
                    if (cacheSignal) {
                      cacheSignal.endRead()
                      cacheSignal = null
                    }
                    await workUnitStore.stagedRendering.waitForStage(
                      RenderStage.Dynamic
                    )
                  }
                  break
                case 'prerender-ppr':
                case 'prerender-legacy':
                case 'cache':
                case 'private-cache':
                case 'unstable-cache':
                  break
                default:
                  workUnitStore satisfies never
              }
            }

            markCurrentScopeAsDynamic(
              workStore,
              workUnitStore,
              `revalidate: 0 fetch ${input} ${workStore.route}`
            )
          }

          // We only want to set the revalidate store's revalidate time if it
          // was explicitly set for the fetch call, i.e.
          // originalFetchRevalidate.
          if (revalidateStore && originalFetchRevalidate === finalRevalidate) {
            revalidateStore.revalidate = finalRevalidate
          }
        }

        const isCacheableRevalidate =
          typeof finalRevalidate === 'number' && finalRevalidate > 0

        let cacheKey: string | undefined
        const { incrementalCache } = workStore
        let isHmrRefresh = false
        let serverComponentsHmrCache: ServerComponentsHmrCache | undefined

        if (workUnitStore) {
          switch (workUnitStore.type) {
            case 'request':
            case 'cache':
            case 'private-cache':
              isHmrRefresh = workUnitStore.isHmrRefresh ?? false
              serverComponentsHmrCache = workUnitStore.serverComponentsHmrCache
              break
            case 'prerender':
            case 'prerender-client':
            case 'prerender-runtime':
            case 'prerender-ppr':
            case 'prerender-legacy':
            case 'unstable-cache':
              break
            default:
              workUnitStore satisfies never
          }
        }

        if (
          incrementalCache &&
          (isCacheableRevalidate || serverComponentsHmrCache)
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

        let handleUnlock: () => Promise<void> | void = () => {}

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
                (isCacheableRevalidate || serverComponentsHmrCache)
              ) {
                const normalizedRevalidate =
                  finalRevalidate >= INFINITE_CACHE
                    ? CACHE_ONE_YEAR
                    : finalRevalidate

                const incrementalCacheConfig:
                  | SetIncrementalFetchCacheContext
                  | undefined = isCacheableRevalidate
                  ? {
                      fetchCache: true,
                      fetchUrl,
                      fetchIdx,
                      tags,
                      isImplicitBuildTimeCache,
                    }
                  : undefined

                switch (workUnitStore?.type) {
                  case 'prerender':
                  case 'prerender-client':
                  case 'prerender-runtime':
                    return createCachedPrerenderResponse(
                      res,
                      cacheKey,
                      incrementalCacheConfig,
                      incrementalCache,
                      normalizedRevalidate,
                      handleUnlock
                    )
                  case 'request':
                    if (
                      process.env.NODE_ENV === 'development' &&
                      workUnitStore.stagedRendering &&
                      workUnitStore.cacheSignal
                    ) {
                      // We're filling caches for a staged render,
                      // so we need to wait for the response to finish instead of streaming.
                      return createCachedPrerenderResponse(
                        res,
                        cacheKey,
                        incrementalCacheConfig,
                        incrementalCache,
                        normalizedRevalidate,
                        handleUnlock
                      )
                    }
                  // fallthrough
                  case 'prerender-ppr':
                  case 'prerender-legacy':
                  case 'cache':
                  case 'private-cache':
                  case 'unstable-cache':
                  case undefined:
                    return createCachedDynamicResponse(
                      workStore,
                      res,
                      cacheKey,
                      incrementalCacheConfig,
                      incrementalCache,
                      serverComponentsHmrCache,
                      normalizedRevalidate,
                      input,
                      handleUnlock
                    )
                  default:
                    workUnitStore satisfies never
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

          if (isHmrRefresh && serverComponentsHmrCache) {
            cachedFetchData = serverComponentsHmrCache.get(cacheKey)
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
                  softTags: implicitTags?.tags,
                })

            if (hasNoExplicitCacheConfig && workUnitStore) {
              switch (workUnitStore.type) {
                case 'prerender':
                case 'prerender-client':
                case 'prerender-runtime':
                  // We sometimes use the cache to dedupe fetches that do not
                  // specify a cache configuration. In these cases we want to
                  // make sure we still exclude them from prerenders if
                  // cacheComponents is on so we introduce an artificial task boundary
                  // here.
                  await getTimeoutBoundary()
                  break
                case 'request':
                  if (
                    process.env.NODE_ENV === 'development' &&
                    workUnitStore.stagedRendering
                  ) {
                    await workUnitStore.stagedRendering.waitForStage(
                      RenderStage.Dynamic
                    )
                  }
                  break
                case 'prerender-ppr':
                case 'prerender-legacy':
                case 'cache':
                case 'private-cache':
                case 'unstable-cache':
                  break
                default:
                  workUnitStore satisfies never
              }
            }

            if (entry) {
              await handleUnlock()
            } else {
              // in dev, incremental cache response will be null in case the browser adds `cache-control: no-cache` in the request headers
              // TODO: it seems like we also hit this after revalidates in dev?
              cacheReasonOverride = 'cache-control: no-cache (hard refresh)'
            }

            if (entry?.value && entry.value.kind === CachedRouteKind.FETCH) {
              // when stale and is revalidating we wait for fresh data
              // so the revalidated entry has the updated data
              if (workStore.isStaticGeneration && entry.isStale) {
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

        if (
          (workStore.isStaticGeneration ||
            (process.env.NODE_ENV === 'development' &&
              process.env.__NEXT_CACHE_COMPONENTS &&
              workUnitStore &&
              // eslint-disable-next-line no-restricted-syntax
              workUnitStore.type === 'request' &&
              workUnitStore.stagedRendering)) &&
          init &&
          typeof init === 'object'
        ) {
          const { cache } = init

          // Delete `cache` property as Cloudflare Workers will throw an error
          if (isEdgeRuntime) delete init.cache

          if (cache === 'no-store') {
            // If enabled, we should bail out of static generation.
            if (workUnitStore) {
              switch (workUnitStore.type) {
                case 'prerender':
                case 'prerender-client':
                case 'prerender-runtime':
                  if (cacheSignal) {
                    cacheSignal.endRead()
                    cacheSignal = null
                  }
                  return makeHangingPromise<Response>(
                    workUnitStore.renderSignal,
                    workStore.route,
                    'fetch()'
                  )
                case 'request':
                  if (
                    process.env.NODE_ENV === 'development' &&
                    workUnitStore.stagedRendering
                  ) {
                    if (cacheSignal) {
                      cacheSignal.endRead()
                      cacheSignal = null
                    }
                    await workUnitStore.stagedRendering.waitForStage(
                      RenderStage.Dynamic
                    )
                  }
                  break
                case 'prerender-ppr':
                case 'prerender-legacy':
                case 'cache':
                case 'private-cache':
                case 'unstable-cache':
                  break
                default:
                  workUnitStore satisfies never
              }
            }
            markCurrentScopeAsDynamic(
              workStore,
              workUnitStore,
              `no-store fetch ${input} ${workStore.route}`
            )
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
              if (workUnitStore) {
                switch (workUnitStore.type) {
                  case 'prerender':
                  case 'prerender-client':
                  case 'prerender-runtime':
                    return makeHangingPromise<Response>(
                      workUnitStore.renderSignal,
                      workStore.route,
                      'fetch()'
                    )
                  case 'request':
                    if (
                      process.env.NODE_ENV === 'development' &&
                      workUnitStore.stagedRendering
                    ) {
                      await workUnitStore.stagedRendering.waitForStage(
                        RenderStage.Dynamic
                      )
                    }
                    break
                  case 'cache':
                  case 'private-cache':
                  case 'unstable-cache':
                  case 'prerender-legacy':
                  case 'prerender-ppr':
                    break
                  default:
                    workUnitStore satisfies never
                }
              }
              markCurrentScopeAsDynamic(
                workStore,
                workUnitStore,
                `revalidate: 0 fetch ${input} ${workStore.route}`
              )
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
          // static generation with cacheComponents we need the response to be able to
          // be resolved in a microtask and cloning the response will never have
          // a body that can resolve in a microtask in node (as observed through
          // experimentation) So instead we await the body and then when it is
          // available we construct manually cloned Response objects with the
          // body as an ArrayBuffer. This will be resolvable in a microtask
          // making it compatible with cacheComponents.
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

  // Assign the function name also as a name property, so that it's preserved
  // even when mangling is enabled.
  Object.defineProperty(patched, 'name', { value: 'fetch', writable: false })

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

let currentTimeoutBoundary: null | Promise<void> = null
function getTimeoutBoundary() {
  if (!currentTimeoutBoundary) {
    currentTimeoutBoundary = new Promise((r) => {
      setTimeout(() => {
        currentTimeoutBoundary = null
        r()
      }, 0)
    })
  }
  return currentTimeoutBoundary
}
