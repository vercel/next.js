import { AsyncLocalStorage } from 'async_hooks'

export function createCacheScope() {
  const storage = createCacheMap()
  return {
    run: <T>(callback: () => T): T => {
      return CacheScopeStorage.run(storage, () => callback())
    },
  }
}

export type CacheScope = ReturnType<typeof createCacheScope>

// #region  custom cache dispatcher with support for scoping

// Note that the plan is to upstream this into React itself,
// but after() is an experimental feature, and this should be good enough for now.

type CacheDispatcher = {
  [HAS_CACHE_SCOPE]?: boolean
  getCacheForType: <T>(create: () => T) => T
}

const HAS_CACHE_SCOPE: unique symbol = Symbol.for('next.cacheScope')

type CacheMap = Map<Function, unknown>

function createCacheMap(): CacheMap {
  return new Map()
}

function shouldInterceptCache() {
  return !!CacheScopeStorage.getStore()
}

const CacheScopeStorage: AsyncLocalStorage<CacheMap> =
  new AsyncLocalStorage<CacheMap>()

/** forked from packages/react-server/src/flight/ReactFlightServerCache.js */
function resolveCache(): CacheMap {
  const store = CacheScopeStorage.getStore()
  if (store) {
    return store
  }
  return createCacheMap()
}

/** forked from packages/react-server/src/flight/ReactFlightServerCache.js */
const PatchedCacheDispatcher: CacheDispatcher = {
  getCacheForType<T>(resourceType: () => T): T {
    if (!shouldInterceptCache()) {
      throw new Error(
        'Invariant: Expected patched cache dispatcher to run within CacheScopeStorage'
      )
    }
    const cache = resolveCache()
    let entry: T | undefined = cache.get(resourceType) as any
    if (entry === undefined) {
      entry = resourceType()
      // TODO: Warn if undefined?
      cache.set(resourceType, entry)
    }
    return entry
  },
}

// #endregion

// #region  injecting the patched dispatcher into React

export function patchCacheScopeSupportIntoReact(React: typeof import('react')) {
  const ReactCurrentCache = getReactCurrentCacheRef(React)
  if (ReactCurrentCache.current) {
    patchReactCache(ReactCurrentCache.current)
  } else {
    let current: (typeof ReactCurrentCache)['current'] = null
    Object.defineProperty(ReactCurrentCache, 'current', {
      get: () => current,
      set: (maybeDispatcher) => {
        try {
          if (maybeDispatcher) {
            patchReactCache(maybeDispatcher)
          }
        } catch (err) {
          console.error('Invariant: could not patch the React cache dispatcher')
        }
        current = maybeDispatcher
      },
    })
  }
}

function patchReactCache(dispatcher: CacheDispatcher) {
  if (dispatcher[HAS_CACHE_SCOPE]) {
    return
  }
  const { getCacheForType: originalGetCacheForType } = dispatcher

  dispatcher.getCacheForType = function <T>(
    this: CacheDispatcher,
    create: () => T
  ) {
    if (shouldInterceptCache()) {
      return PatchedCacheDispatcher.getCacheForType(create)
    }
    return originalGetCacheForType.call(this, create) as T
  }
  dispatcher[HAS_CACHE_SCOPE] = true
}

type ReactWithServerInternals = typeof import('react') &
  ReactServerInternalProperties

type ReactServerInternalProperties =
  | ReactServerSharedInternalsOld
  | ReactServerSharedInternalsNew

type ReactServerSharedInternalsOld = {
  __SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentCache: {
      current: CacheDispatcher | null
    }
  }
}

type ReactServerSharedInternalsNew = {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
    C: {
      current: CacheDispatcher | null
    }
  }
}

function getReactCurrentCacheRef(React: typeof import('react')) {
  const _React = React as ReactWithServerInternals

  const keyOld = '__SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'
  if (keyOld in _React) {
    return _React[keyOld].ReactCurrentCache
  }
  const keyNew =
    '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'
  if (keyNew in _React) {
    return _React[keyNew].C
  }

  throw new Error('Internal error: Unable to access react cache internals')
}

// #endregion
