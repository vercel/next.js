import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  abortAndThrowOnSynchronousDynamicDataAccess,
  throwToInterruptStaticGeneration,
  postponeWithTracking,
  trackDynamicDataInDynamicRender,
  annotateDynamicAccess,
} from '../app-render/dynamic-rendering'

import {
  isDynamicIOPrerender,
  prerenderAsyncStorage,
  type PrerenderStore,
} from '../app-render/prerender-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import {
  describeStringPropertyAccess,
  describeHasCheckingStringProperty,
  throwWithStaticGenerationBailoutErrorWithDynamicError,
} from './utils'

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

export function createPrerenderSearchParamsFromClient(
  staticGenerationStore: StaticGenerationStore
) {
  return createPrerenderSearchParams(staticGenerationStore)
}

export function createRenderSearchParamsFromClient(
  underlyingSearchParams: SearchParams,
  staticGenerationStore: StaticGenerationStore
) {
  return createRenderSearchParams(underlyingSearchParams, staticGenerationStore)
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export const createServerSearchParamsForMetadata =
  createServerSearchParamsForServerPage

export function createServerSearchParamsForServerPage(
  underlyingSearchParams: SearchParams,
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.isStaticGeneration) {
    return createPrerenderSearchParams(staticGenerationStore)
  } else {
    return createRenderSearchParams(
      underlyingSearchParams,
      staticGenerationStore
    )
  }
}

export function createPrerenderSearchParamsForClientPage(
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  const prerenderStore = prerenderAsyncStorage.getStore()
  if (prerenderStore) {
    if (isDynamicIOPrerender(prerenderStore)) {
      // We're prerendering in a mode that aborts (dynamicIO) and should stall
      // the promise to ensure the RSC side is considered dynamic
      return makeHangingPromise()
    }
  }
  // We're prerendering in a mode that does not aborts. We resolve the promise without
  // any tracking because we're just transporting a value from server to client where the tracking
  // will be applied.
  return Promise.resolve({})
}

function createPrerenderSearchParams(
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  const prerenderStore = prerenderAsyncStorage.getStore()
  if (prerenderStore) {
    if (prerenderStore.controller || prerenderStore.cacheSignal) {
      // We are in a dynamicIO (PPR or otherwise) prerender
      return makeAbortingExoticSearchParams(
        staticGenerationStore.route,
        prerenderStore
      )
    }
  }

  // We are in a legacy static generation and need to interrupt the prerender
  // when search params are accessed.
  return makeErroringExoticSearchParams(staticGenerationStore, prerenderStore)
}

function createRenderSearchParams(
  underlyingSearchParams: SearchParams,
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  } else {
    if (
      process.env.NODE_ENV === 'development' &&
      !staticGenerationStore.isPrefetchRequest
    ) {
      return makeDynamicallyTrackedExoticSearchParamsWithDevWarnings(
        underlyingSearchParams,
        staticGenerationStore
      )
    } else {
      return makeUntrackedExoticSearchParams(
        underlyingSearchParams,
        staticGenerationStore
      )
    }
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

function makeAbortingExoticSearchParams(
  route: string,
  prerenderStore: PrerenderStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(prerenderStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = makeHangingPromise<SearchParams>()

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
        // Object prototype
        case 'hasOwnProperty':
        case 'isPrototypeOf':
        case 'propertyIsEnumerable':
        case 'toString':
        case 'valueOf':
        case 'toLocaleString':

        // Promise prototype
        // fallthrough
        case 'catch':
        case 'finally':

        // Common tested properties
        // fallthrough
        case 'toJSON':
        case '$$typeof':
        case '__esModule': {
          // These properties cannot be shadowed because they need to be the
          // true underlying value for Promises to work correctly at runtime
          return ReflectAdapter.get(target, prop, receiver)
        }

        default: {
          if (typeof prop === 'string') {
            const expression = describeStringPropertyAccess(
              'searchParams',
              prop
            )
            abortAndThrowOnSynchronousDynamicDataAccess(
              route,
              expression,
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
        abortAndThrowOnSynchronousDynamicDataAccess(
          route,
          expression,
          prerenderStore
        )
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
      abortAndThrowOnSynchronousDynamicDataAccess(
        route,
        expression,
        prerenderStore
      )
    },
  })

  CachedSearchParams.set(prerenderStore, proxiedPromise)
  return proxiedPromise
}

function makeErroringExoticSearchParams(
  staticGenerationStore: StaticGenerationStore,
  prerenderStore: undefined | PrerenderStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(staticGenerationStore)
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
        // Object prototype
        case 'hasOwnProperty':
        case 'isPrototypeOf':
        case 'propertyIsEnumerable':
        case 'toString':
        case 'valueOf':
        case 'toLocaleString':

        // Promise prototype
        // fallthrough
        case 'catch':
        case 'finally':

        // Common tested properties
        // fallthrough
        case 'toJSON':
        case '$$typeof':
        case '__esModule': {
          // These properties cannot be shadowed because they need to be the
          // true underlying value for Promises to work correctly at runtime
          return ReflectAdapter.get(target, prop, receiver)
        }
        case 'then': {
          const expression =
            '`await searchParams`, `searchParams.then`, or similar'
          if (staticGenerationStore.dynamicShouldError) {
            throwWithStaticGenerationBailoutErrorWithDynamicError(
              staticGenerationStore.route,
              expression
            )
          } else if (prerenderStore) {
            postponeWithTracking(
              staticGenerationStore.route,
              expression,
              prerenderStore.dynamicTracking
            )
          } else {
            throwToInterruptStaticGeneration(expression, staticGenerationStore)
          }
          return
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          if (staticGenerationStore.dynamicShouldError) {
            throwWithStaticGenerationBailoutErrorWithDynamicError(
              staticGenerationStore.route,
              expression
            )
          } else if (prerenderStore) {
            postponeWithTracking(
              staticGenerationStore.route,
              expression,
              prerenderStore.dynamicTracking
            )
          } else {
            throwToInterruptStaticGeneration(expression, staticGenerationStore)
          }
          return
        }
        default: {
          if (typeof prop === 'string') {
            const expression = describeStringPropertyAccess(
              'searchParams',
              prop
            )
            if (staticGenerationStore.dynamicShouldError) {
              throwWithStaticGenerationBailoutErrorWithDynamicError(
                staticGenerationStore.route,
                expression
              )
            } else if (prerenderStore) {
              postponeWithTracking(
                staticGenerationStore.route,
                expression,
                prerenderStore.dynamicTracking
              )
            } else {
              throwToInterruptStaticGeneration(
                expression,
                staticGenerationStore
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
        if (staticGenerationStore.dynamicShouldError) {
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            staticGenerationStore.route,
            expression
          )
        } else if (prerenderStore) {
          postponeWithTracking(
            staticGenerationStore.route,
            expression,
            prerenderStore.dynamicTracking
          )
        } else {
          throwToInterruptStaticGeneration(expression, staticGenerationStore)
        }
        return false
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
      if (staticGenerationStore.dynamicShouldError) {
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          staticGenerationStore.route,
          expression
        )
      } else if (prerenderStore) {
        postponeWithTracking(
          staticGenerationStore.route,
          expression,
          prerenderStore.dynamicTracking
        )
      } else {
        throwToInterruptStaticGeneration(expression, staticGenerationStore)
      }
    },
  })

  CachedSearchParams.set(staticGenerationStore, proxiedPromise)
  return proxiedPromise
}

function makeUntrackedExoticSearchParams(
  underlyingSearchParams: SearchParams,
  store: StaticGenerationStore
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
    switch (prop) {
      // Object prototype
      case 'hasOwnProperty':
      case 'isPrototypeOf':
      case 'propertyIsEnumerable':
      case 'toString':
      case 'valueOf':
      case 'toLocaleString':

      // Promise prototype
      // fallthrough
      case 'then':
      case 'catch':
      case 'finally':

      // React Promise extension
      // fallthrough
      case 'status':

      // Common tested properties
      // fallthrough
      case 'toJSON':
      case '$$typeof':
      case '__esModule': {
        // These properties cannot be shadowed because they need to be the
        // true underlying value for Promises to work correctly at runtime
        break
      }
      default: {
        Object.defineProperty(promise, prop, {
          get() {
            trackDynamicDataInDynamicRender(store)
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
    }
  })

  return promise
}

function makeDynamicallyTrackedExoticSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams,
  store: StaticGenerationStore
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
        trackDynamicDataInDynamicRender(store)
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
  const promise = Promise.resolve(proxiedUnderlying)
  promise.then(() => {
    promiseInitialized = true
  })

  Object.keys(underlyingSearchParams).forEach((prop) => {
    switch (prop) {
      // Object prototype
      case 'hasOwnProperty':
      case 'isPrototypeOf':
      case 'propertyIsEnumerable':
      case 'toString':
      case 'valueOf':
      case 'toLocaleString':

      // Promise prototype
      // fallthrough
      case 'then':
      case 'catch':
      case 'finally':

      // React Promise extension
      // fallthrough
      case 'status':

      // Common tested properties
      // fallthrough
      case 'toJSON':
      case '$$typeof':
      case '__esModule': {
        // These properties cannot be shadowed because they need to be the
        // true underlying value for Promises to work correctly at runtime
        unproxiedProperties.push(prop)
        break
      }
      default: {
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
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (
          // We are accessing a property that was proxied to the promise instance
          proxiedProperties.has(prop) ||
          // We are accessing a property that doesn't exist on the promise nor the underlying
          Reflect.has(target, prop) === false
        ) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          warnForSyncAccess(store.route, expression)
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
        const expression = describeHasCheckingStringProperty(
          'searchParams',
          prop
        )
        warnForSyncAccess(store.route, expression)
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      warnForEnumeration(store.route, unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlyingSearchParams, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(route: undefined | string, expression: string) {
  const prefix = route ? ` In route ${route} a ` : 'A '
  console.error(
    `${prefix}searchParam property was accessed directly with ${expression}. ` +
      `\`searchParams\` should be awaited before accessing properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function warnForEnumeration(
  route: undefined | string,
  missingProperties: Array<string>
) {
  const prefix = route ? ` In route ${route} ` : ''
  if (missingProperties.length) {
    const describedMissingProperties =
      describeListOfPropertyNames(missingProperties)
    console.error(
      `${prefix}searchParams are being enumerated incompletely missing these properties: ${describedMissingProperties}. ` +
        `\`searchParams\` should be awaited before accessing its properties. ` +
        `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
    )
  } else {
    console.error(
      `${prefix}searchParams are being enumerated. ` +
        `\`searchParams\` should be awaited before accessing its properties. ` +
        `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
    )
  }
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
