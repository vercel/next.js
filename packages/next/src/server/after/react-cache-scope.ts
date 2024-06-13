import { AsyncLocalStorage } from 'async_hooks'
import { InvariantError } from '../../shared/lib/invariant-error'

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
  // DEV-only (or !disableStringRefs)
  getOwner?: () => null | Record<string, unknown>
}

const HAS_CACHE_SCOPE: unique symbol = Symbol.for('next.cacheScope')

type CacheMap = Map<Function, unknown>

function createCacheMap(): CacheMap {
  return new Map()
}

function isWithinCacheScope() {
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
const ScopedCacheDispatcher: CacheDispatcher = {
  getCacheForType<T>(resourceType: () => T): T {
    if (!isWithinCacheScope()) {
      throw new InvariantError(
        'Expected patched cache dispatcher to run within CacheScopeStorage'
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
  const internals = getReactServerInternals(React)
  if ('A' in internals) {
    if (internals.A) {
      patchReactCacheDispatcher(internals.A)
    } else {
      patchReactCacheDispatcherWhenSet(internals, 'A')
    }
  } else {
    throw new InvariantError(
      'Could not find cache dispatcher in React internals'
    )
  }
}

function patchReactCacheDispatcher(dispatcher: CacheDispatcher) {
  if (dispatcher[HAS_CACHE_SCOPE]) {
    return
  }
  const { getCacheForType: originalGetCacheForType } = dispatcher

  dispatcher.getCacheForType = function <T>(
    this: CacheDispatcher,
    create: () => T
  ) {
    if (isWithinCacheScope()) {
      return ScopedCacheDispatcher.getCacheForType(create)
    }
    return originalGetCacheForType.call(this, create) as T
  }
  dispatcher[HAS_CACHE_SCOPE] = true
}

function patchReactCacheDispatcherWhenSet<
  Container extends Record<string, any> & { [HAS_CACHE_SCOPE]?: boolean },
>(container: Container, key: keyof Container) {
  if (container[HAS_CACHE_SCOPE]) {
    return
  }

  let current: CacheDispatcher | null = null
  Object.defineProperty(container, key, {
    get: () => current,
    set: (maybeDispatcher) => {
      try {
        if (maybeDispatcher) {
          patchReactCacheDispatcher(maybeDispatcher)
        }
      } catch (err) {
        throw new InvariantError('Could not patch the React cache dispatcher', {
          cause: err,
        })
      }
      current = maybeDispatcher
    },
  })
  container[HAS_CACHE_SCOPE] = true
}

type ReactWithServerInternals = typeof import('react') &
  ReactServerInternalProperties

type ReactServerInternalProperties = {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: ReactServerSharedInternals
}

type ReactServerSharedInternals = {
  [HAS_CACHE_SCOPE]?: boolean
  A: CacheDispatcher | null
}

const INTERNALS_KEY =
  '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

function getReactServerInternals(
  React: typeof import('react')
): ReactServerSharedInternals {
  const _React = React as ReactWithServerInternals

  if (INTERNALS_KEY in _React) {
    return _React[INTERNALS_KEY]
  }

  throw new InvariantError('Could not access React server internals')
}

// #endregion
