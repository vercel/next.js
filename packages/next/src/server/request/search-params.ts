import type { WorkStore } from '../app-render/work-async-storage.external'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  abortAndThrowOnSynchronousRequestDataAccess,
  throwToInterruptStaticGeneration,
  postponeWithTracking,
  trackDynamicDataInDynamicRender,
  annotateDynamicAccess,
  trackSynchronousRequestDataAccessInDev,
} from '../app-render/dynamic-rendering'

import {
  workUnitAsyncStorage,
  type PrerenderStore,
  type PrerenderStoreLegacy,
  type PrerenderStorePPR,
  type PrerenderStoreModern,
} from '../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import {
  describeStringPropertyAccess,
  describeHasCheckingStringProperty,
  throwWithStaticGenerationBailoutErrorWithDynamicError,
  wellKnownProperties,
  throwForSearchParamsAccessInUseCache,
} from './utils'
import { scheduleImmediate } from '../../lib/scheduler'

export type SearchParams = { [key: string]: string | string[] | undefined }

/**
 * In this version of Next.js the `params` prop passed to Layouts, Pages, and other Segments is a Promise.
 * However to facilitate migration to this new Promise type you can currently still access params directly on the Promise instance passed to these Segments.
 * The `UnsafeUnwrappedSearchParams` type is available if you need to temporarily access the underlying params without first awaiting or `use`ing the Promise.
 *
 * In a future version of Next.js the `params` prop will be a plain Promise and this type will be removed.
 *
 * Typically instances of `params` can be updated automatically to be treated as a Promise by a codemod published alongside this Next.js version however if you
 * have not yet run the codemod of the codemod cannot detect certain instances of `params` usage you should first try to refactor your code to await `params`.
 *
 * If refactoring is not possible but you still want to be able to access params directly without typescript errors you can cast the params Promise to this type
 *
 * ```tsx
 * type Props = { searchParams: Promise<{ foo: string }> }
 *
 * export default async function Page(props: Props) {
 *  const { searchParams } = (props.searchParams as unknown as UnsafeUnwrappedSearchParams<typeof props.searchParams>)
 *  return ...
 * }
 * ```
 *
 * This type is marked deprecated to help identify it as target for refactoring away.
 *
 * @deprecated
 */
export type UnsafeUnwrappedSearchParams<P> =
  P extends Promise<infer U> ? Omit<U, 'then' | 'status' | 'value'> : never

export function createSearchParamsFromClient(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore
) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-ppr':
      case 'prerender-legacy':
        return createPrerenderSearchParams(workStore, workUnitStore)
      default:
      // fallthrough
    }
  }
  return createRenderSearchParams(underlyingSearchParams, workStore)
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export const createServerSearchParamsForMetadata =
  createServerSearchParamsForServerPage

export function createServerSearchParamsForServerPage(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore
): Promise<SearchParams> {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-ppr':
      case 'prerender-legacy':
        return createPrerenderSearchParams(workStore, workUnitStore)
      default:
      // fallthrough
    }
  }
  return createRenderSearchParams(underlyingSearchParams, workStore)
}

export function createPrerenderSearchParamsForClientPage(
  workStore: WorkStore
): Promise<SearchParams> {
  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  const prerenderStore = workUnitAsyncStorage.getStore()
  if (prerenderStore && prerenderStore.type === 'prerender') {
    // dynamicIO Prerender
    // We're prerendering in a mode that aborts (dynamicIO) and should stall
    // the promise to ensure the RSC side is considered dynamic
    return makeHangingPromise(prerenderStore.renderSignal, '`searchParams`')
  }
  // We're prerendering in a mode that does not aborts. We resolve the promise without
  // any tracking because we're just transporting a value from server to client where the tracking
  // will be applied.
  return Promise.resolve({})
}

function createPrerenderSearchParams(
  workStore: WorkStore,
  prerenderStore: PrerenderStore
): Promise<SearchParams> {
  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  if (prerenderStore.type === 'prerender') {
    // We are in a dynamicIO (PPR or otherwise) prerender
    return makeAbortingExoticSearchParams(workStore.route, prerenderStore)
  }

  // The remaining cases are prerender-ppr and prerender-legacy
  // We are in a legacy static generation and need to interrupt the prerender
  // when search params are accessed.
  return makeErroringExoticSearchParams(workStore, prerenderStore)
}

function createRenderSearchParams(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore
): Promise<SearchParams> {
  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  } else {
    if (
      process.env.NODE_ENV === 'development' &&
      !workStore.isPrefetchRequest
    ) {
      return makeDynamicallyTrackedExoticSearchParamsWithDevWarnings(
        underlyingSearchParams,
        workStore
      )
    } else {
      return makeUntrackedExoticSearchParams(underlyingSearchParams, workStore)
    }
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

const CachedSearchParamsForUseCache = new WeakMap<
  CacheLifetime,
  Promise<SearchParams>
>()

function makeAbortingExoticSearchParams(
  route: string,
  prerenderStore: PrerenderStoreModern
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(prerenderStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = makeHangingPromise<SearchParams>(
    prerenderStore.renderSignal,
    '`searchParams`'
  )

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (Object.hasOwn(promise, prop)) {
        // The promise has this property directly. we must return it.
        // We know it isn't a dynamic access because it can only be something
        // that was previously written to the promise and thus not an underlying searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      switch (prop) {
        case 'then': {
          const expression =
            '`await searchParams`, `searchParams.then`, or similar'
          annotateDynamicAccess(expression, prerenderStore)
          return ReflectAdapter.get(target, prop, receiver)
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          annotateDynamicAccess(expression, prerenderStore)
          return ReflectAdapter.get(target, prop, receiver)
        }

        default: {
          if (typeof prop === 'string' && !wellKnownProperties.has(prop)) {
            const expression = describeStringPropertyAccess(
              'searchParams',
              prop
            )
            const error = createSearchAccessError(route, expression)
            abortAndThrowOnSynchronousRequestDataAccess(
              route,
              expression,
              error,
              prerenderStore
            )
          }
          return ReflectAdapter.get(target, prop, receiver)
        }
      }
    },
    has(target, prop) {
      // We don't expect key checking to be used except for testing the existence of
      // searchParams so we make all has tests trigger dynamic. this means that `promise.then`
      // can resolve to the then function on the Promise prototype but 'then' in promise will assume
      // you are testing whether the searchParams has a 'then' property.
      if (typeof prop === 'string') {
        const expression = describeHasCheckingStringProperty(
          'searchParams',
          prop
        )
        const error = createSearchAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
      const error = createSearchAccessError(route, expression)
      abortAndThrowOnSynchronousRequestDataAccess(
        route,
        expression,
        error,
        prerenderStore
      )
    },
  })

  CachedSearchParams.set(prerenderStore, proxiedPromise)
  return proxiedPromise
}

function makeErroringExoticSearchParams(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreLegacy | PrerenderStorePPR
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(workStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const underlyingSearchParams = {}
  // For search params we don't construct a ReactPromise because we want to interrupt
  // rendering on any property access that was not set from outside and so we only want
  // to have properties like value and status if React sets them.
  const promise = Promise.resolve(underlyingSearchParams)

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (Object.hasOwn(promise, prop)) {
        // The promise has this property directly. we must return it.
        // We know it isn't a dynamic access because it can only be something
        // that was previously written to the promise and thus not an underlying searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      switch (prop) {
        case 'then': {
          const expression =
            '`await searchParams`, `searchParams.then`, or similar'
          if (workStore.dynamicShouldError) {
            throwWithStaticGenerationBailoutErrorWithDynamicError(
              workStore.route,
              expression
            )
          } else if (prerenderStore.type === 'prerender-ppr') {
            // PPR Prerender (no dynamicIO)
            postponeWithTracking(
              workStore.route,
              expression,
              prerenderStore.dynamicTracking
            )
          } else {
            // Legacy Prerender
            throwToInterruptStaticGeneration(
              expression,
              workStore,
              prerenderStore
            )
          }
          return
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          if (workStore.dynamicShouldError) {
            throwWithStaticGenerationBailoutErrorWithDynamicError(
              workStore.route,
              expression
            )
          } else if (prerenderStore.type === 'prerender-ppr') {
            // PPR Prerender (no dynamicIO)
            postponeWithTracking(
              workStore.route,
              expression,
              prerenderStore.dynamicTracking
            )
          } else {
            // Legacy Prerender
            throwToInterruptStaticGeneration(
              expression,
              workStore,
              prerenderStore
            )
          }
          return
        }
        default: {
          if (typeof prop === 'string' && !wellKnownProperties.has(prop)) {
            const expression = describeStringPropertyAccess(
              'searchParams',
              prop
            )
            if (workStore.dynamicShouldError) {
              throwWithStaticGenerationBailoutErrorWithDynamicError(
                workStore.route,
                expression
              )
            } else if (prerenderStore.type === 'prerender-ppr') {
              // PPR Prerender (no dynamicIO)
              postponeWithTracking(
                workStore.route,
                expression,
                prerenderStore.dynamicTracking
              )
            } else {
              // Legacy Prerender
              throwToInterruptStaticGeneration(
                expression,
                workStore,
                prerenderStore
              )
            }
          }
          return ReflectAdapter.get(target, prop, receiver)
        }
      }
    },
    has(target, prop) {
      // We don't expect key checking to be used except for testing the existence of
      // searchParams so we make all has tests trigger dynamic. this means that `promise.then`
      // can resolve to the then function on the Promise prototype but 'then' in promise will assume
      // you are testing whether the searchParams has a 'then' property.
      if (typeof prop === 'string') {
        const expression = describeHasCheckingStringProperty(
          'searchParams',
          prop
        )
        if (workStore.dynamicShouldError) {
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            workStore.route,
            expression
          )
        } else if (prerenderStore.type === 'prerender-ppr') {
          // PPR Prerender (no dynamicIO)
          postponeWithTracking(
            workStore.route,
            expression,
            prerenderStore.dynamicTracking
          )
        } else {
          // Legacy Prerender
          throwToInterruptStaticGeneration(
            expression,
            workStore,
            prerenderStore
          )
        }
        return false
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
      if (workStore.dynamicShouldError) {
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          workStore.route,
          expression
        )
      } else if (prerenderStore.type === 'prerender-ppr') {
        // PPR Prerender (no dynamicIO)
        postponeWithTracking(
          workStore.route,
          expression,
          prerenderStore.dynamicTracking
        )
      } else {
        // Legacy Prerender
        throwToInterruptStaticGeneration(expression, workStore, prerenderStore)
      }
    },
  })

  CachedSearchParams.set(workStore, proxiedPromise)
  return proxiedPromise
}

/**
 * This is a variation of `makeErroringExoticSearchParams` that always throws an
 * error on access, because accessing searchParams inside of `"use cache"` is
 * not allowed.
 */
export function makeErroringExoticSearchParamsForUseCache(
  workStore: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParamsForUseCache.get(workStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = Promise.resolve({})

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (Object.hasOwn(promise, prop)) {
        // The promise has this property directly. we must return it. We know it
        // isn't a dynamic access because it can only be something that was
        // previously written to the promise and thus not an underlying
        // searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      if (
        typeof prop === 'string' &&
        (prop === 'then' || !wellKnownProperties.has(prop))
      ) {
        throwForSearchParamsAccessInUseCache(workStore.route)
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      // We don't expect key checking to be used except for testing the existence of
      // searchParams so we make all has tests throw an error. this means that `promise.then`
      // can resolve to the then function on the Promise prototype but 'then' in promise will assume
      // you are testing whether the searchParams has a 'then' property.
      if (
        typeof prop === 'string' &&
        (prop === 'then' || !wellKnownProperties.has(prop))
      ) {
        throwForSearchParamsAccessInUseCache(workStore.route)
      }

      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      throwForSearchParamsAccessInUseCache(workStore.route)
    },
  })

  CachedSearchParamsForUseCache.set(workStore, proxiedPromise)
  return proxiedPromise
}

function makeUntrackedExoticSearchParams(
  underlyingSearchParams: SearchParams,
  store: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  // We don't use makeResolvedReactPromise here because searchParams
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(underlyingSearchParams)
  CachedSearchParams.set(underlyingSearchParams, promise)

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (!wellKnownProperties.has(prop)) {
      Object.defineProperty(promise, prop, {
        get() {
          const workUnitStore = workUnitAsyncStorage.getStore()
          trackDynamicDataInDynamicRender(store, workUnitStore)
          return underlyingSearchParams[prop]
        },
        set(value) {
          Object.defineProperty(promise, prop, {
            value,
            writable: true,
            enumerable: true,
          })
        },
        enumerable: true,
        configurable: true,
      })
    }
  })

  return promise
}

function makeDynamicallyTrackedExoticSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams,
  store: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []

  // We have an unfortunate sequence of events that requires this initialization logic. We want to instrument the underlying
  // searchParams object to detect if you are accessing values in dev. This is used for warnings and for things like the static prerender
  // indicator. However when we pass this proxy to our Promise.resolve() below the VM checks if the resolved value is a promise by looking
  // at the `.then` property. To our dynamic tracking logic this is indistinguishable from a `then` searchParam and so we would normally trigger
  // dynamic tracking. However we know that this .then is not real dynamic access, it's just how thenables resolve in sequence. So we introduce
  // this initialization concept so we omit the dynamic check until after we've constructed our resolved promise.
  let promiseInitialized = false
  const proxiedUnderlying = new Proxy(underlyingSearchParams, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && promiseInitialized) {
        if (store.dynamicShouldError) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            store.route,
            expression
          )
        }
        const workUnitStore = workUnitAsyncStorage.getStore()
        trackDynamicDataInDynamicRender(store, workUnitStore)
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (store.dynamicShouldError) {
          const expression = describeHasCheckingStringProperty(
            'searchParams',
            prop
          )
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            store.route,
            expression
          )
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      if (store.dynamicShouldError) {
        const expression =
          '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          store.route,
          expression
        )
      }
      return Reflect.ownKeys(target)
    },
  })

  // We don't use makeResolvedReactPromise here because searchParams
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = new Promise<SearchParams>((resolve) =>
    scheduleImmediate(() => resolve(underlyingSearchParams))
  )
  promise.then(() => {
    promiseInitialized = true
  })

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
      unproxiedProperties.push(prop)
    } else {
      proxiedProperties.add(prop)
      Object.defineProperty(promise, prop, {
        get() {
          return proxiedUnderlying[prop]
        },
        set(newValue) {
          Object.defineProperty(promise, prop, {
            value: newValue,
            writable: true,
            enumerable: true,
          })
        },
        enumerable: true,
        configurable: true,
      })
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (prop === 'then' && store.dynamicShouldError) {
        const expression = '`searchParams.then`'
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          store.route,
          expression
        )
      }
      if (typeof prop === 'string') {
        if (
          !wellKnownProperties.has(prop) &&
          (proxiedProperties.has(prop) ||
            // We are accessing a property that doesn't exist on the promise nor
            // the underlying searchParams.
            Reflect.has(target, prop) === false)
        ) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          syncIODev(store.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string') {
        proxiedProperties.delete(prop)
      }
      return Reflect.set(target, prop, value, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (
          !wellKnownProperties.has(prop) &&
          (proxiedProperties.has(prop) ||
            // We are accessing a property that doesn't exist on the promise nor
            // the underlying searchParams.
            Reflect.has(target, prop) === false)
        ) {
          const expression = describeHasCheckingStringProperty(
            'searchParams',
            prop
          )
          syncIODev(store.route, expression)
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      const expression = '`Object.keys(searchParams)` or similar'
      syncIODev(store.route, expression, unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlyingSearchParams, proxiedPromise)
  return proxiedPromise
}

function syncIODev(
  route: string | undefined,
  expression: string,
  missingProperties?: Array<string>
) {
  // In all cases we warn normally
  if (missingProperties && missingProperties.length > 0) {
    warnForIncompleteEnumeration(route, expression, missingProperties)
  } else {
    warnForSyncAccess(route, expression)
  }

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
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createSearchAccessError
)

const warnForIncompleteEnumeration =
  createDedupedByCallsiteServerErrorLoggerDev(createIncompleteEnumerationError)

function createSearchAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`searchParams\` should be awaited before using its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function createIncompleteEnumerationError(
  route: string | undefined,
  expression: string,
  missingProperties: Array<string>
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`searchParams\` should be awaited before using its properties. ` +
      `The following properties were not available through enumeration ` +
      `because they conflict with builtin or well-known property names: ` +
      `${describeListOfPropertyNames(missingProperties)}. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function describeListOfPropertyNames(properties: Array<string>) {
  switch (properties.length) {
    case 0:
      throw new InvariantError(
        'Expected describeListOfPropertyNames to be called with a non-empty list of strings.'
      )
    case 1:
      return `\`${properties[0]}\``
    case 2:
      return `\`${properties[0]}\` and \`${properties[1]}\``
    default: {
      let description = ''
      for (let i = 0; i < properties.length - 1; i++) {
        description += `\`${properties[i]}\`, `
      }
      description += `, and \`${properties[properties.length - 1]}\``
      return description
    }
  }
}
