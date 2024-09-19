import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  abortOnSynchronousDynamicDataAccess,
  interruptStaticGeneration,
  postponeWithTracking,
  trackDynamicDataInDynamicRender,
  annotateDynamicAccess,
} from '../app-render/dynamic-rendering'

import {
  prerenderAsyncStorage,
  type PrerenderStore,
} from '../app-render/prerender-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

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

export function reifyClientPrerenderSearchParams(
  staticGenerationStore: StaticGenerationStore
) {
  return createPrerenderSearchParams(staticGenerationStore)
}

export function reifyClientRenderSearchParams(
  underlying: SearchParams,
  staticGenerationStore: StaticGenerationStore
) {
  return createRenderSearchParams(underlying, staticGenerationStore)
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export const createServerSearchParamsForMetadata =
  createServerSearchParamsForServerPage

export function createServerSearchParamsForServerPage(
  underlying: SearchParams,
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.isStaticGeneration) {
    return createPrerenderSearchParams(staticGenerationStore)
  } else {
    return createRenderSearchParams(underlying, staticGenerationStore)
  }
}

export function createServerSearchParamsForClientPage(
  underlying: SearchParams,
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.isStaticGeneration) {
    return createPassthroughPrerenderSearchParams(staticGenerationStore)
  } else {
    return Promise.resolve(underlying)
  }
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

function createPassthroughPrerenderSearchParams(
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
      // We're prerendering in a mode that aborts (dynamicIO) and should stall
      // the promise to ensure the RSC side is considered dynamic
      return new Promise(hangForever)
    }
  }
  // We're prerendering in a mode that does not aborts. We resolve the promise without
  // any tracking because we're just transporting a value from server to client where the tracking
  // will be applied.
  return Promise.resolve({})
}

function createRenderSearchParams(
  underlying: SearchParams,
  staticGenerationStore: StaticGenerationStore
): Promise<SearchParams> {
  if (staticGenerationStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  } else {
    if (process.env.NODE_ENV === 'development') {
      return makeDynamicallyTrackedExoticSearchParamsWithDevWarnings(
        underlying,
        staticGenerationStore
      )
    } else {
      return makeUntrackedExoticSearchParams(underlying, staticGenerationStore)
    }
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

function hangForever() {}
function makeAbortingExoticSearchParams(
  route: string,
  prerenderStore: PrerenderStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(prerenderStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const underlying: SearchParams = {}
  const promise = new Promise<SearchParams>(hangForever)

  const controller = prerenderStore.controller
  const dynamicTracking = prerenderStore.dynamicTracking

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
          annotateDynamicAccess(expression, dynamicTracking)
          return ReflectAdapter.get(target, prop, receiver)
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          annotateDynamicAccess(expression, dynamicTracking)
          return ReflectAdapter.get(target, prop, receiver)
        }
        default: {
          if (typeof prop === 'string') {
            const expression = describeStringPropertyAccess(prop)
            abortOnSynchronousDynamicDataAccess(
              route,
              expression,
              controller,
              dynamicTracking
            )
            return undefined
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
        const expression = describeHasCheckingStringProperty(prop)
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return false
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
      abortOnSynchronousDynamicDataAccess(
        route,
        expression,
        controller,
        dynamicTracking
      )
      return Reflect.ownKeys(underlying)
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

  const underlying = {}
  const promise = Promise.resolve(underlying)

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
          if (staticGenerationStore.dynamicShouldError) {
            interruptWithStaticGenerationBailoutError(
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
            interruptStaticGeneration(expression, staticGenerationStore)
          }
          return
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          if (staticGenerationStore.dynamicShouldError) {
            interruptWithStaticGenerationBailoutError(
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
            interruptStaticGeneration(expression, staticGenerationStore)
          }
          return
        }
        default: {
          if (typeof prop === 'string') {
            const expression = describeStringPropertyAccess(prop)
            if (staticGenerationStore.dynamicShouldError) {
              interruptWithStaticGenerationBailoutError(
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
              interruptStaticGeneration(expression, staticGenerationStore)
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
        const expression = describeHasCheckingStringProperty(prop)
        if (staticGenerationStore.dynamicShouldError) {
          interruptWithStaticGenerationBailoutError(
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
          interruptStaticGeneration(expression, staticGenerationStore)
        }
        return false
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
      if (staticGenerationStore.dynamicShouldError) {
        interruptWithStaticGenerationBailoutError(
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
        interruptStaticGeneration(expression, staticGenerationStore)
      }
    },
  })

  CachedSearchParams.set(staticGenerationStore, proxiedPromise)
  return proxiedPromise
}

function makeUntrackedExoticSearchParams(
  underlying: SearchParams,
  store: StaticGenerationStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlying)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = Promise.resolve(underlying)
  CachedSearchParams.set(underlying, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlying,
      writable: true,
    },
  })

  Object.keys(underlying).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'value':
      case 'status': {
        // These properties cannot be shadowed with a search param because they
        // are necessary for ReactPromise's to work correctly with `use`
        break
      }
      default: {
        Object.defineProperty(promise, prop, {
          get() {
            trackDynamicDataInDynamicRender(store)
            return underlying[prop]
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
  underlying: SearchParams,
  store: StaticGenerationStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlying)
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
  const proxiedUnderlying = new Proxy(underlying, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && promiseInitialized) {
        if (store.dynamicShouldError) {
          const expression = describeStringPropertyAccess(prop)
          throw new StaticGenBailoutError(
            `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
          )
        }
        trackDynamicDataInDynamicRender(store)
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (store.dynamicShouldError) {
          const expression = describeHasCheckingStringProperty(prop)
          throw new StaticGenBailoutError(
            `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
          )
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      if (store.dynamicShouldError) {
        const expression =
          '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
        throw new StaticGenBailoutError(
          `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
        )
      }
      return Reflect.ownKeys(target)
    },
  })

  const promise = Promise.resolve(proxiedUnderlying)
  promise.then(() => {
    promiseInitialized = true
  })

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlying,
      writable: true,
    },
  })

  Object.keys(underlying).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'value':
      case 'status': {
        // These properties cannot be shadowed with a search param because they
        // are necessary for ReactPromise's to work correctly with `use`
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
          const expression = describeStringPropertyAccess(prop)
          warnForSyncAccess(store.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        const expression = describeHasCheckingStringProperty(prop)
        warnForSyncAccess(store.route, expression)
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      warnForEnumeration(store.route, unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlying, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(route: undefined | string, expression: string) {
  const prefix = route ? ` In route ${route} a ` : 'A '
  console.error(
    `${prefix}searchParam property was accessed directly with ${expression}. \`searchParams\` is now a Promise and should be awaited before accessing properties of the underlying searchParams object. In this version of Next.js direct access to searchParam properties is still supported to facilitate migration but in a future version you will be required to await \`searchParams\`. If this use is inside an async function await it. If this use is inside a synchronous function then convert the function to async or await it from outside this function and pass the result in.`
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
      `${prefix}searchParams are being enumerated incompletely with \`{...searchParams}\`, \`Object.keys(searchParams)\`, or similar. The following properties were not copied: ${describedMissingProperties}. \`searchParams\` is now a Promise, however in the current version of Next.js direct access to the underlying searchParams object is still supported to facilitate migration to the new type. search parameter names that conflict with Promise properties cannot be accessed directly and must be accessed by first awaiting the \`searchParams\` promise.`
    )
  } else {
    console.error(
      `${prefix}searchParams are being enumerated with \`{...searchParams}\`, \`Object.keys(searchParams)\`, or similar. \`searchParams\` is now a Promise, however in the current version of Next.js direct access to the underlying searchParams object is still supported to facilitate migration to the new type. You should update your code to await \`searchParams\` before accessing its properties.`
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

// This regex will have fast negatives meaning valid identifiers may not pass
// this test. However this is only used during static generation to provide hints
// about why a page bailed out of some or all prerendering and we can use bracket notation
// for example while `ಠ_ಠ` is a valid identifier it's ok to print `searchParams['ಠ_ಠ']`
// even if this would have been fine too `searchParams.ಠ_ಠ`
const isDefinitelyAValidIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function describeStringPropertyAccess(prop: string) {
  if (isDefinitelyAValidIdentifier.test(prop)) {
    return `\`searchParams.${prop}\``
  }
  return `\`searchParams[${JSON.stringify(prop)}]\``
}

function describeHasCheckingStringProperty(prop: string) {
  const stringifiedProp = JSON.stringify(prop)
  return `\`Reflect.has(searchParams, ${stringifiedProp}\`, \`${stringifiedProp} in searchParams\`, or similar`
}

function interruptWithStaticGenerationBailoutError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}
