import {
  getDraftModeProviderForCacheScope,
  throwForMissingRequestStore,
} from '../app-render/work-unit-async-storage.external'

import type { DraftModeProvider } from '../async-storage/draft-mode-provider'

import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import {
  abortAndThrowOnSynchronousRequestDataAccess,
  delayUntilRuntimeStage,
  postponeWithTracking,
  trackDynamicDataInDynamicRender,
  trackSynchronousRequestDataAccessInDev,
} from '../app-render/dynamic-rendering'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { DynamicServerError } from '../../client/components/hooks-server-context'
import { InvariantError } from '../../shared/lib/invariant-error'
import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'

/**
 * In this version of Next.js `draftMode()` returns a Promise however you can still reference the properties of the underlying draftMode object
 * synchronously to facilitate migration. The `UnsafeUnwrappedDraftMode` type is added to your code by a codemod that attempts to automatically
 * updates callsites to reflect the new Promise return type. There are some cases where `draftMode()` cannot be automatically converted, namely
 * when it is used inside a synchronous function and we can't be sure the function can be made async automatically. In these cases we add an
 * explicit type case to `UnsafeUnwrappedDraftMode` to enable typescript to allow for the synchronous usage only where it is actually necessary.
 *
 * You should should update these callsites to either be async functions where the `draftMode()` value can be awaited or you should call `draftMode()`
 * from outside and await the return value before passing it into this function.
 *
 * You can find instances that require manual migration by searching for `UnsafeUnwrappedDraftMode` in your codebase or by search for a comment that
 * starts with `@next-codemod-error`.
 *
 * In a future version of Next.js `draftMode()` will only return a Promise and you will not be able to access the underlying draftMode object directly
 * without awaiting the return value first. When this change happens the type `UnsafeUnwrappedDraftMode` will be updated to reflect that is it no longer
 * usable.
 *
 * This type is marked deprecated to help identify it as target for refactoring away.
 *
 * @deprecated
 */
export type UnsafeUnwrappedDraftMode = DraftMode

export function draftMode(): Promise<DraftMode> {
  const callingExpression = 'draftMode'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore || !workUnitStore) {
    throwForMissingRequestStore(callingExpression)
  }

  switch (workUnitStore.type) {
    case 'prerender-runtime':
      // TODO(runtime-ppr): does it make sense to delay this? normally it's always microtasky
      return delayUntilRuntimeStage(
        workUnitStore,
        createOrGetCachedDraftMode(workUnitStore.draftMode, workStore)
      )
    case 'request':
      return createOrGetCachedDraftMode(workUnitStore.draftMode, workStore)

    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      // Inside of `"use cache"` or `unstable_cache`, draft mode is available if
      // the outmost work unit store is a request store (or a runtime prerender),
      // and if draft mode is enabled.
      const draftModeProvider = getDraftModeProviderForCacheScope(
        workStore,
        workUnitStore
      )

      if (draftModeProvider) {
        return createOrGetCachedDraftMode(draftModeProvider, workStore)
      }

    // Otherwise, we fall through to providing an empty draft mode.
    // eslint-disable-next-line no-fallthrough
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
      // Return empty draft mode
      return createOrGetCachedDraftMode(null, workStore)

    default:
      return workUnitStore satisfies never
  }
}

function createOrGetCachedDraftMode(
  draftModeProvider: DraftModeProvider | null,
  workStore: WorkStore | undefined
): Promise<DraftMode> {
  const cacheKey = draftModeProvider ?? NullDraftMode
  const cachedDraftMode = CachedDraftModes.get(cacheKey)

  if (cachedDraftMode) {
    return cachedDraftMode
  }

  let promise: Promise<DraftMode>

  if (process.env.NODE_ENV === 'development' && !workStore?.isPrefetchRequest) {
    const route = workStore?.route

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      return createDraftModeWithDevWarnings(draftModeProvider, route)
    }

    promise = createExoticDraftModeWithDevWarnings(draftModeProvider, route)
  } else {
    if (process.env.__NEXT_CACHE_COMPONENTS) {
      return Promise.resolve(new DraftMode(draftModeProvider))
    }

    promise = createExoticDraftMode(draftModeProvider)
  }

  CachedDraftModes.set(cacheKey, promise)

  return promise
}

interface CacheLifetime {}
const NullDraftMode = {}
const CachedDraftModes = new WeakMap<CacheLifetime, Promise<DraftMode>>()

function createExoticDraftMode(
  underlyingProvider: null | DraftModeProvider
): Promise<DraftMode> {
  const instance = new DraftMode(underlyingProvider)
  const promise = Promise.resolve(instance)

  Object.defineProperty(promise, 'isEnabled', {
    get() {
      return instance.isEnabled
    },
    enumerable: true,
    configurable: true,
  })
  ;(promise as any).enable = instance.enable.bind(instance)
  ;(promise as any).disable = instance.disable.bind(instance)

  return promise
}

function createExoticDraftModeWithDevWarnings(
  underlyingProvider: null | DraftModeProvider,
  route: undefined | string
): Promise<DraftMode> {
  const instance = new DraftMode(underlyingProvider)
  const promise = Promise.resolve(instance)

  Object.defineProperty(promise, 'isEnabled', {
    get() {
      const expression = '`draftMode().isEnabled`'
      syncIODev(route, expression)
      return instance.isEnabled
    },
    enumerable: true,
    configurable: true,
  })

  Object.defineProperty(promise, 'enable', {
    value: function get() {
      const expression = '`draftMode().enable()`'
      syncIODev(route, expression)
      return instance.enable.apply(instance, arguments as any)
    },
  })

  Object.defineProperty(promise, 'disable', {
    value: function get() {
      const expression = '`draftMode().disable()`'
      syncIODev(route, expression)
      return instance.disable.apply(instance, arguments as any)
    },
  })

  return promise
}

// Similar to `createExoticDraftModeWithDevWarnings`, but just logging the sync
// access without actually defining the draftMode properties on the promise.
function createDraftModeWithDevWarnings(
  underlyingProvider: null | DraftModeProvider,
  route: undefined | string
): Promise<DraftMode> {
  const instance = new DraftMode(underlyingProvider)
  const promise = Promise.resolve(instance)

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      switch (prop) {
        case 'isEnabled':
          warnForSyncAccess(route, `\`draftMode().${prop}\``)
          break
        case 'enable':
        case 'disable': {
          warnForSyncAccess(route, `\`draftMode().${prop}()\``)
          break
        }
        default: {
          // We only warn for well-defined properties of the draftMode object.
        }
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
  })

  return proxiedPromise
}

class DraftMode {
  /**
   * @internal - this declaration is stripped via `tsc --stripInternal`
   */
  private readonly _provider: null | DraftModeProvider

  constructor(provider: null | DraftModeProvider) {
    this._provider = provider
  }
  get isEnabled() {
    if (this._provider !== null) {
      return this._provider.isEnabled
    }
    return false
  }
  public enable() {
    // We have a store we want to track dynamic data access to ensure we
    // don't statically generate routes that manipulate draft mode.
    trackDynamicDraftMode('draftMode().enable()', this.enable)
    if (this._provider !== null) {
      this._provider.enable()
    }
  }
  public disable() {
    trackDynamicDraftMode('draftMode().disable()', this.disable)
    if (this._provider !== null) {
      this._provider.disable()
    }
  }
}

function syncIODev(route: string | undefined, expression: string) {
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'request':
        if (workUnitStore.prerenderPhase === true) {
          // When we're rendering dynamically in dev, we need to advance out of
          // the Prerender environment when we read Request data synchronously.
          trackSynchronousRequestDataAccessInDev(workUnitStore)
        }
        break
      case 'prerender':
      case 'prerender-client':
      case 'prerender-runtime':
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

  // In all cases we warn normally
  warnForSyncAccess(route, expression)
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createDraftModeAccessError
)

function createDraftModeAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`draftMode()\` should be awaited before using its value. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function trackDynamicDraftMode(expression: string, constructorOpt: Function) {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore) {
    // We have a store we want to track dynamic data access to ensure we
    // don't statically generate routes that manipulate draft mode.
    if (workUnitStore?.phase === 'after') {
      throw new Error(
        `Route ${workStore.route} used "${expression}" inside \`after\`. The enabled status of draftMode can be read inside \`after\` but you cannot enable or disable draftMode. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`
      )
    }

    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'cache':
        case 'private-cache': {
          const error = new Error(
            `Route ${workStore.route} used "${expression}" inside "use cache". The enabled status of draftMode can be read in caches but you must not enable or disable draftMode inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, constructorOpt)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used "${expression}" inside a function cached with "unstable_cache(...)". The enabled status of draftMode can be read in caches but you must not enable or disable draftMode inside a cache. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )

        case 'prerender':
        case 'prerender-runtime': {
          const error = new Error(
            `Route ${workStore.route} used ${expression} without first calling \`await connection()\`. See more info here: https://nextjs.org/docs/messages/next-prerender-sync-headers`
          )
          return abortAndThrowOnSynchronousRequestDataAccess(
            workStore.route,
            expression,
            error,
            workUnitStore
          )
        }
        case 'prerender-client':
          const exportName = '`draftMode`'
          throw new InvariantError(
            `${exportName} must not be used within a client component. Next.js should be preventing ${exportName} from being included in client components statically, but did not in this case.`
          )
        case 'prerender-ppr':
          return postponeWithTracking(
            workStore.route,
            expression,
            workUnitStore.dynamicTracking
          )
        case 'prerender-legacy':
          workUnitStore.revalidate = 0

          const err = new DynamicServerError(
            `Route ${workStore.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
          )
          workStore.dynamicUsageDescription = expression
          workStore.dynamicUsageStack = err.stack

          throw err
        case 'request':
          trackDynamicDataInDynamicRender(workUnitStore)
          break
        default:
          workUnitStore satisfies never
      }
    }
  }
}
