import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import type { FallbackRouteParams } from './fallback-params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  abortAndThrowOnSynchronousDynamicDataAccess,
  throwToInterruptStaticGeneration,
  postponeWithTracking,
} from '../app-render/dynamic-rendering'

import {
  isDynamicIOPrerender,
  prerenderAsyncStorage,
  type PrerenderStore,
} from '../app-render/prerender-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { makeResolvedReactPromise, describeStringPropertyAccess } from './utils'
import { makeHangingPromise } from '../dynamic-rendering-utils'

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

export function createPrerenderParamsFromClient(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
) {
  return createPrerenderParams(underlyingParams, staticGenerationStore)
}

export function createRenderParamsFromClient(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
) {
  return createRenderParams(underlyingParams, staticGenerationStore)
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export type CreateServerParamsForMetadata = typeof createServerParamsForMetadata
export const createServerParamsForMetadata = createServerParamsForServerSegment

// routes always runs in RSC context so it is equivalent to a Server Page Component
export function createServerParamsForRoute(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
) {
  if (staticGenerationStore.isStaticGeneration) {
    return createPrerenderParams(underlyingParams, staticGenerationStore)
  } else {
    return createRenderParams(underlyingParams, staticGenerationStore)
  }
}

export function createServerParamsForServerSegment(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  if (staticGenerationStore.isStaticGeneration) {
    return createPrerenderParams(underlyingParams, staticGenerationStore)
  } else {
    return createRenderParams(underlyingParams, staticGenerationStore)
  }
}

export function createPrerenderParamsForClientSegment(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  const prerenderStore = prerenderAsyncStorage.getStore()
  if (prerenderStore) {
    if (isDynamicIOPrerender(prerenderStore)) {
      const fallbackParams = staticGenerationStore.fallbackRouteParams
      if (fallbackParams) {
        for (let key in underlyingParams) {
          if (fallbackParams.has(key)) {
            // This params object has one of more fallback params so we need to consider
            // the awaiting of this params object "dynamic". Since we are in dynamicIO mode
            // we encode this as a promise that never resolves
            return makeHangingPromise()
          }
        }
      }
    }
  }
  // We're prerendering in a mode that does not abort. We resolve the promise without
  // any tracking because we're just transporting a value from server to client where the tracking
  // will be applied.
  return makeResolvedReactPromise(underlyingParams)
}

function createPrerenderParams(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  const fallbackParams = staticGenerationStore.fallbackRouteParams
  if (fallbackParams) {
    let hasSomeFallbackParams = false
    for (const key in underlyingParams) {
      if (fallbackParams.has(key)) {
        hasSomeFallbackParams = true
        break
      }
    }

    if (hasSomeFallbackParams) {
      // params need to be treated as dynamic because we have at least one fallback param
      const prerenderStore = prerenderAsyncStorage.getStore()
      if (prerenderStore) {
        if (isDynamicIOPrerender(prerenderStore)) {
          // We are in a dynamicIO (PPR or otherwise) prerender
          return makeAbortingExoticParams(
            underlyingParams,
            staticGenerationStore.route,
            prerenderStore
          )
        }
      }
      // We aren't in a dynamicIO prerender but we do have fallback params at this
      // level so we need to make an erroring exotic params object which will postpone
      // if you access the fallback params
      return makeErroringExoticParams(
        underlyingParams,
        fallbackParams,
        staticGenerationStore,
        prerenderStore
      )
    }
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return makeUntrackedExoticParams(underlyingParams)
}

function createRenderParams(
  underlyingParams: Params,
  staticGenerationStore: StaticGenerationStore
): Promise<Params> {
  if (
    process.env.NODE_ENV === 'development' &&
    !staticGenerationStore.isPrefetchRequest
  ) {
    return makeDynamicallyTrackedExoticParamsWithDevWarnings(
      underlyingParams,
      staticGenerationStore
    )
  } else {
    return makeUntrackedExoticParams(underlyingParams)
  }
}

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeAbortingExoticParams(
  underlyingParams: Params,
  route: string,
  prerenderStore: PrerenderStore
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = makeHangingPromise<Params>()
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
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
            const expression = describeStringPropertyAccess('params', prop)
            abortAndThrowOnSynchronousDynamicDataAccess(
              route,
              expression,
              prerenderStore
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
  underlyingParams: Params,
  fallbackParams: FallbackRouteParams,
  staticGenerationStore: StaticGenerationStore,
  prerenderStore: undefined | PrerenderStore
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const augmentedUnderlying = { ...underlyingParams }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(augmentedUnderlying)
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
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
        if (fallbackParams.has(prop)) {
          Object.defineProperty(augmentedUnderlying, prop, {
            get() {
              const expression = describeStringPropertyAccess('params', prop)
              // In most dynamic APIs we also throw if `dynamic = "error"` however
              // for params is only dynamic when we're generating a fallback shell
              // and even when `dynamic = "error"` we still support generating dynamic
              // fallback shells
              // TODO remove this comment when dynamicIO is the default since there
              // will be no `dynamic = "error"`
              if (prerenderStore) {
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
            },
            enumerable: true,
          })
          Object.defineProperty(promise, prop, {
            get() {
              const expression = describeStringPropertyAccess('params', prop)
              // In most dynamic APIs we also throw if `dynamic = "error"` however
              // for params is only dynamic when we're generating a fallback shell
              // and even when `dynamic = "error"` we still support generating dynamic
              // fallback shells
              // TODO remove this comment when dynamicIO is the default since there
              // will be no `dynamic = "error"`
              if (prerenderStore) {
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
          ;(promise as any)[prop] = underlyingParams[prop]
        }
      }
    }
  })

  return promise
}

function makeUntrackedExoticParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
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
        ;(promise as any)[prop] = underlyingParams[prop]
      }
    }
  })

  return promise
}

function makeDynamicallyTrackedExoticParamsWithDevWarnings(
  underlyingParams: Params,
  store: StaticGenerationStore
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(underlyingParams)

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []

  Object.keys(underlyingParams).forEach((prop) => {
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
        ;(promise as any)[prop] = underlyingParams[prop]
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
          const expression = describeStringPropertyAccess('params', prop)
          warnForSyncAccess(store.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string') {
        proxiedProperties.delete(prop)
      }
      return ReflectAdapter.set(target, prop, value, receiver)
    },
    ownKeys(target) {
      warnForEnumeration(store.route, unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedParams.set(underlyingParams, proxiedPromise)
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
