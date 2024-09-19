import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  abortOnSynchronousDynamicDataAccess,
  interruptStaticGeneration,
  postponeWithTracking,
  type DynamicTrackingState,
} from '../app-render/dynamic-rendering'

import {
  prerenderAsyncStorage,
  type PrerenderStore,
} from '../app-render/prerender-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

export type Params = Record<string, string | Array<string> | undefined>

/**
 * In this version of Next.js the `params` prop passed to Layouts, Pages, and other Segments is a Promise.
 * However to facilitate migration to this new Promise type you can currently still access params directly on the Promise instance passed to these Segments.
 * The `UnsafeUnwrappedParams` type is available if you need to temporarily access the underlying params without first awaiting or `use`ing the Promise.
 *
 * In a future version of Next.js the `params` prop will be a plain Promise and this type will be removed.
 *
 * Typically instances of `params` can be updated automatically to be treated as a Promise by a codemod published alongside this Next.js version however if you
 * have not yet run the codemod of the codemod cannot detect certain instances of `params` usage you should first try to refactor your code to await `params`.
 *
 * If refactoring is not possible but you still want to be able to access params directly without typescript errors you can cast the params Promise to this type
 *
 * ```tsx
 * type Props = { params: Promise<{ id: string }>}
 *
 * export default async function Layout(props: Props) {
 *  const directParams = (props.params as unknown as UnsafeUnwrappedParams<typeof props.params>)
 *  return ...
 * }
 * ```
 *
 * This type is marked deprecated to help identify it as target for refactoring away.
 *
 * @deprecated
 */
export type UnsafeUnwrappedParams<P> =
  P extends Promise<infer U> ? Omit<U, 'then' | 'status' | 'value'> : never

export function reifyClientPrerenderParams(
  underlying: Params,
  fallbackParamNamesAtThisLevel: undefined | Set<string>,
  staticGenerationStore: StaticGenerationStore
) {
  return createPrerenderParams(
    underlying,
    fallbackParamNamesAtThisLevel,
    staticGenerationStore
  )
}

export function reifyClientRenderParams(
  underlying: Params,
  staticGenerationStore: StaticGenerationStore
) {
  return createRenderParams(underlying, staticGenerationStore)
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export type CreateServerParamsForMetadata = typeof createServerParamsForMetadata
export const createServerParamsForMetadata = createServerParamsForServerSegment

// routes always runs in RSC context so it is equivalent to a Server Page Component
export function createServerParamsForRoute(
  underlying: Params,
  staticGenerationStore: StaticGenerationStore
) {
  if (staticGenerationStore.isStaticGeneration) {
    return createPrerenderParams(underlying, undefined, staticGenerationStore)
  } else {
    return createRenderParams(underlying, staticGenerationStore)
  }
}

export function createServerParamsForServerSegment(
  underlying: Params,
  fallbackParamNamesAtThisLevel: undefined | Set<string>,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  if (staticGenerationStore.isStaticGeneration) {
    return createPrerenderParams(
      underlying,
      fallbackParamNamesAtThisLevel,
      staticGenerationStore
    )
  } else {
    return createRenderParams(underlying, staticGenerationStore)
  }
}

export function createServerParamsForClientSegment(
  underlying: Params,
  fallbackParamNamesAtThisLevel: Set<string>,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  if (staticGenerationStore.isStaticGeneration) {
    return createPassthroughPrerenderParams(
      underlying,
      fallbackParamNamesAtThisLevel
    )
  } else {
    return Promise.resolve(underlying)
  }
}

function createPrerenderParams(
  underlying: Params,
  fallbackParamNamesAtThisLevel: undefined | Set<string>,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  if (fallbackParamNamesAtThisLevel && fallbackParamNamesAtThisLevel.size) {
    // params need to be treated as dynamic because we have at least one fallback param
    const prerenderStore = prerenderAsyncStorage.getStore()
    if (prerenderStore) {
      if (prerenderStore.controller || prerenderStore.cacheSignal) {
        // We are in a dynamicIO (PPR or otherwise) prerender
        return makeAbortingExoticParams(
          underlying,
          staticGenerationStore.route,
          prerenderStore.controller,
          prerenderStore.dynamicTracking
        )
      }
    }
    // We aren't in a dynamicIO prerender but we do have fallback params at this
    // level so we need to make an erroring exotic params object which will postpone
    // if you access the fallback params
    return makeErroringExoticParams(
      underlying,
      fallbackParamNamesAtThisLevel,
      staticGenerationStore,
      prerenderStore
    )
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return makeUntrackedExoticParams(underlying)
}

function createPassthroughPrerenderParams(
  underlying: Params,
  fallbackParamNamesAtThisLevel: Set<string>
): Promise<Params> {
  const prerenderStore = prerenderAsyncStorage.getStore()
  if (prerenderStore) {
    if (prerenderStore.controller || prerenderStore.cacheSignal) {
      if (fallbackParamNamesAtThisLevel.size) {
        // This params object has one of more fallback params so we need to consider
        // the awaiting of this params object "dynamic". Since we are in dynamicIO mode
        // we encode this as a promise that never resolves
        return new Promise(hangForever)
      }
    }
  }
  // We're prerendering in a mode that does not abort. We resolve the promise without
  // any tracking because we're just transporting a value from server to client where the tracking
  // will be applied.
  const p = Promise.resolve(underlying)
  ;(p as any).status = 'fulfilled'
  ;(p as any).value = underlying
  return p
  // return Promise.resolve(underlying)
}

function createRenderParams(
  underlying: Params,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  if (process.env.NODE_ENV === 'development') {
    return makeDynamicallyTrackedExoticParamsWithDevWarnings(
      underlying,
      staticGenerationStore
    )
  } else {
    return makeUntrackedExoticParams(underlying)
  }
}

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function hangForever() {}
function makeAbortingExoticParams(
  underlying: Params,
  route: string,
  controller: null | AbortController,
  dynamicTracking: null | DynamicTrackingState
): Promise<Params> {
  const cachedParams = CachedParams.get(underlying)
  if (cachedParams) {
    return cachedParams
  }

  const promise = new Promise<Params>(hangForever)
  CachedParams.set(underlying, promise)

  // We reserve properties on the promise that are part of ReactPromise
  // This ensures that React does not interpret params as values when
  // hoisting properties onto the promise
  Object.defineProperties(promise, {
    status: {
      value: 'pending',
      writable: true,
    },
  })

  Object.keys(underlying).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'status': {
        // We can't assign params over these properties because the VM and React use
        // them to reason about the Promise.
        break
      }
      default: {
        Object.defineProperty(promise, prop, {
          get() {
            const expression = describeStringPropertyAccess(prop)
            abortOnSynchronousDynamicDataAccess(
              route,
              expression,
              controller,
              dynamicTracking
            )
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

  return promise
}

function makeErroringExoticParams(
  underlying: Params,
  fallbackRouteParamsAtThisLevel: Set<string>,
  staticGenerationStore: StaticGenerationStore,
  prerenderStore: undefined | PrerenderStore
): Promise<Params> {
  const cachedParams = CachedParams.get(underlying)
  if (cachedParams) {
    return cachedParams
  }

  const augmentedUnderyling = { ...underlying }
  const promise = Promise.resolve(augmentedUnderyling)
  CachedParams.set(underlying, promise)

  // We reserve properties on the promise that are part of ReactPromise
  // This ensures that React does not interpret params as values when
  // hoisting properties onto the promise
  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: augmentedUnderyling,
      writable: true,
    },
  })

  Object.keys(underlying).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'status':
      case 'value': {
        // We can't assign params over these properties because the VM and React use
        // them to reason about the Promise.
        break
      }
      default: {
        if (fallbackRouteParamsAtThisLevel.has(prop)) {
          Object.defineProperty(augmentedUnderyling, prop, {
            get() {
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
            },
            enumerable: true,
          })
          Object.defineProperty(promise, prop, {
            get() {
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
        } else {
          ;(promise as any)[prop] = underlying[prop]
        }
      }
    }
  })

  return promise
}

function makeUntrackedExoticParams(underlying: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlying)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlying)
  CachedParams.set(underlying, promise)

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
        ;(promise as any)[prop] = underlying[prop]
      }
    }
  })

  return promise
}

function makeDynamicallyTrackedExoticParamsWithDevWarnings(
  underlying: Params,
  store: StaticGenerationStore
): Promise<Params> {
  const cachedParams = CachedParams.get(underlying)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlying)

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

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []

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
        ;(promise as any)[prop] = underlying[prop]
      }
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (
          // We are accessing a property that was proxied to the promise instance
          proxiedProperties.has(prop)
        ) {
          const expression = describeStringPropertyAccess(prop)
          warnForSyncAccess(store.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    ownKeys(target) {
      warnForEnumeration(store.route, unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedParams.set(underlying, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(route: undefined | string, expression: string) {
  const prefix = route ? ` In route ${route} a ` : 'A '
  console.error(
    `${prefix}param property was accessed directly with ${expression}. \`params\` is now a Promise and should be awaited before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to facilitate migration but in a future version you will be required to await \`params\`. If this use is inside an async function await it. If this use is inside a synchronous function then convert the function to async or await it from outside this function and pass the result in.`
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
      `${prefix}params are being enumerated incompletely with \`{...params}\`, \`Object.keys(params)\`, or similar. The following properties were not copied: ${describedMissingProperties}. \`params\` is now a Promise, however in the current version of Next.js direct access to the underlying params object is still supported to facilitate migration to the new type. param names that conflict with Promise properties cannot be accessed directly and must be accessed by first awaiting the \`params\` promise.`
    )
  } else {
    console.error(
      `${prefix}params are being enumerated with \`{...params}\`, \`Object.keys(params)\`, or similar. \`params\` is now a Promise, however in the current version of Next.js direct access to the underlying params object is still supported to facilitate migration to the new type. You should update your code to await \`params\` before accessing its properties.`
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
// for example while `ಠ_ಠ` is a valid identifier it's ok to print `params['ಠ_ಠ']`
// even if this would have been fine too `params.ಠ_ಠ`
const isDefinitelyAValidIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function describeStringPropertyAccess(prop: string) {
  if (isDefinitelyAValidIdentifier.test(prop)) {
    return `\`params.${prop}\``
  }
  return `\`params[${JSON.stringify(prop)}]\``
}

function interruptWithStaticGenerationBailoutError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}
