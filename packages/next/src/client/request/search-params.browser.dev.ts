import type { SearchParams } from '../../server/request/search-params'

import { ReflectAdapter } from '../../server/web/spec-extension/adapters/reflect'
import {
  describeStringPropertyAccess,
  describeHasCheckingStringProperty,
  wellKnownProperties,
} from '../../shared/lib/utils/reflect-utils'

interface CacheLifetime {}

export function makeUntrackedExoticSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams,
  CachedSearchParams: WeakMap<CacheLifetime, Promise<SearchParams>>
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
