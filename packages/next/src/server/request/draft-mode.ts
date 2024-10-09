import { getExpectedRequestStore } from '../../server/app-render/work-unit-async-storage.external'

import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'

import { workAsyncStorage } from '../../client/components/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { trackDynamicDataAccessed } from '../app-render/dynamic-rendering'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-loger'

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
 * starts with:
 *
 * ```
 * // TODO [sync-draftMode-usage]
 * ```
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

  if (
    workUnitStore &&
    (workUnitStore.type === 'cache' ||
      workUnitStore.type === 'unstable-cache' ||
      workUnitStore.type === 'prerender' ||
      workUnitStore.type === 'prerender-ppr' ||
      workUnitStore.type === 'prerender-legacy')
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
      const expression = 'draftMode().isEnabled'
      warnForSyncAccess(route, expression)
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
      const expression = 'draftMode().enable()'
      warnForSyncAccess(route, expression)
      return instance.enable.apply(instance, arguments as any)
    },
  })

  Object.defineProperty(promise, 'disable', {
    value: function get() {
      const expression = 'draftMode().disable()'
      warnForSyncAccess(route, expression)
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
    const store = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()
    if (store) {
      // We we have a store we want to track dynamic data access to ensure we
      // don't statically generate routes that manipulate draft mode.
      trackDynamicDataAccessed(store, workUnitStore, 'draftMode().enable()')
    }
    if (this._provider !== null) {
      this._provider.enable()
    }
  }
  public disable() {
    const store = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()
    if (store) {
      // We we have a store we want to track dynamic data access to ensure we
      // don't statically generate routes that manipulate draft mode.
      trackDynamicDataAccessed(store, workUnitStore, 'draftMode().disable()')
    }
    if (this._provider !== null) {
      this._provider.disable()
    }
  }
}

const noop = () => {}

const warnForSyncAccess = process.env.__NEXT_DISABLE_SYNC_DYNAMIC_API_WARNINGS
  ? noop
  : createDedupedByCallsiteServerErrorLoggerDev(function getSyncAccessWarning(
      route: undefined | string,
      expression: string
    ) {
      const prefix = route ? ` In route ${route} a ` : 'A '
      return (
        `${prefix}\`draftMode()\` property was accessed directly with \`${expression}\`. ` +
        `\`draftMode()\` should be awaited before using its value. ` +
        `Learn more: https://nextjs.org/docs/messages/draft-mode-sync-access`
      )
    })
