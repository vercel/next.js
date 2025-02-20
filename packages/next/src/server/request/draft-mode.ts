import { getExpectedRequestStore } from '../app-render/work-unit-async-storage.external'

import type { DraftModeProvider } from '../async-storage/draft-mode-provider'

import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import {
  abortAndThrowOnSynchronousRequestDataAccess,
  postponeWithTracking,
  trackSynchronousRequestDataAccessInDev,
} from '../app-render/dynamic-rendering'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { DynamicServerError } from '../../client/components/hooks-server-context'

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

  if (workUnitStore) {
    if (
      workUnitStore.type === 'cache' ||
      workUnitStore.type === 'unstable-cache' ||
      workUnitStore.type === 'prerender' ||
      workUnitStore.type === 'prerender-ppr' ||
      workUnitStore.type === 'prerender-legacy'
    ) {
      // Return empty draft mode
      if (
        process.env.NODE_ENV === 'development' &&
        !workStore?.isPrefetchRequest
      ) {
        const route = workStore?.route
        return createExoticDraftModeWithDevWarnings(null, route)
      } else {
        return createExoticDraftMode(null)
      }
    }
  }

  const requestStore = getExpectedRequestStore(callingExpression)

  const cachedDraftMode = CachedDraftModes.get(requestStore.draftMode)
  if (cachedDraftMode) {
    return cachedDraftMode
  }

  let promise
  if (process.env.NODE_ENV === 'development' && !workStore?.isPrefetchRequest) {
    const route = workStore?.route
    promise = createExoticDraftModeWithDevWarnings(
      requestStore.draftMode,
      route
    )
  } else {
    promise = createExoticDraftMode(requestStore.draftMode)
  }
  CachedDraftModes.set(requestStore.draftMode, promise)
  return promise
}

interface CacheLifetime {}
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
    set(newValue) {
      Object.defineProperty(promise, 'isEnabled', {
        value: newValue,
        writable: true,
        enumerable: true,
      })
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
    set(newValue) {
      Object.defineProperty(promise, 'isEnabled', {
        value: newValue,
        writable: true,
        enumerable: true,
      })
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
    trackDynamicDraftMode('draftMode().enable()')
    if (this._provider !== null) {
      this._provider.enable()
    }
  }
  public disable() {
    trackDynamicDraftMode('draftMode().disable()')
    if (this._provider !== null) {
      this._provider.disable()
    }
  }
}

function syncIODev(route: string | undefined, expression: string) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (
    workUnitStore &&
    workUnitStore.type === 'request' &&
    workUnitStore.prerenderPhase === true
  ) {
    // When we're rendering dynamically in dev we need to advance out of the
    // Prerender environment when we read Request data synchronously
    const requestStore = workUnitStore
    trackSynchronousRequestDataAccessInDev(requestStore)
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

function trackDynamicDraftMode(expression: string) {
  const store = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (store) {
    // We have a store we want to track dynamic data access to ensure we
    // don't statically generate routes that manipulate draft mode.
    if (workUnitStore) {
      if (workUnitStore.type === 'cache') {
        throw new Error(
          `Route ${store.route} used "${expression}" inside "use cache". The enabled status of draftMode can be read in caches but you must not enable or disable draftMode inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
        )
      } else if (workUnitStore.type === 'unstable-cache') {
        throw new Error(
          `Route ${store.route} used "${expression}" inside a function cached with "unstable_cache(...)". The enabled status of draftMode can be read in caches but you must not enable or disable draftMode inside a cache. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
        )
      } else if (workUnitStore.phase === 'after') {
        throw new Error(
          `Route ${store.route} used "${expression}" inside \`after\`. The enabled status of draftMode can be read inside \`after\` but you cannot enable or disable draftMode. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`
        )
      }
    }

    if (store.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      if (workUnitStore.type === 'prerender') {
        // dynamicIO Prerender
        const error = new Error(
          `Route ${store.route} used ${expression} without first calling \`await connection()\`. See more info here: https://nextjs.org/docs/messages/next-prerender-sync-headers`
        )
        abortAndThrowOnSynchronousRequestDataAccess(
          store.route,
          expression,
          error,
          workUnitStore
        )
      } else if (workUnitStore.type === 'prerender-ppr') {
        // PPR Prerender
        postponeWithTracking(
          store.route,
          expression,
          workUnitStore.dynamicTracking
        )
      } else if (workUnitStore.type === 'prerender-legacy') {
        // legacy Prerender
        workUnitStore.revalidate = 0

        const err = new DynamicServerError(
          `Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
        )
        store.dynamicUsageDescription = expression
        store.dynamicUsageStack = err.stack

        throw err
      } else if (
        process.env.NODE_ENV === 'development' &&
        workUnitStore &&
        workUnitStore.type === 'request'
      ) {
        workUnitStore.usedDynamic = true
      }
    }
  }
}
