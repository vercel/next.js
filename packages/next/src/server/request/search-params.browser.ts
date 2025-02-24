import type { SearchParams } from './search-params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  describeStringPropertyAccess,
  describeHasCheckingStringProperty,
  wellKnownProperties,
} from './utils'

export function createRenderSearchParamsFromClient(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  if (process.env.NODE_ENV === 'development') {
    return makeUntrackedExoticSearchParamsWithDevWarnings(
      underlyingSearchParams
    )
  } else {
    return makeUntrackedExoticSearchParams(underlyingSearchParams)
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

function makeUntrackedExoticSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []

  const promise = Promise.resolve(underlyingSearchParams)

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
      unproxiedProperties.push(prop)
    } else {
      proxiedProperties.add(prop)
      ;(promise as any)[prop] = underlyingSearchParams[prop]
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (
          !wellKnownProperties.has(prop) &&
          (proxiedProperties.has(prop) ||
            // We are accessing a property that doesn't exist on the promise nor
            // the underlying searchParams.
            Reflect.has(target, prop) === false)
        ) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          warnForSyncAccess(expression)
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
          warnForSyncAccess(expression)
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      warnForSyncSpread()
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlyingSearchParams, proxiedPromise)
  return proxiedPromise
}

function makeUntrackedExoticSearchParams(
  underlyingSearchParams: SearchParams
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
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      ;(promise as any)[prop] = underlyingSearchParams[prop]
    }
  })

  return promise
}

function warnForSyncAccess(expression: string) {
  console.error(
    `A searchParam property was accessed directly with ${expression}. ` +
      `\`searchParams\` should be unwrapped with \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function warnForSyncSpread() {
  console.error(
    `The keys of \`searchParams\` were accessed directly. ` +
      `\`searchParams\` should be unwrapped with \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}
