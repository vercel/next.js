import type { SearchParams } from './search-params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  describeStringPropertyAccess,
  describeHasCheckingStringProperty,
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

  const promise = Promise.resolve(underlyingSearchParams)
  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
    },
    value: {
      value: underlyingSearchParams,
    },
  })

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (Reflect.has(promise, prop)) {
      // We can't assign a value over a property on the promise. The only way to
      // access this is if you await the promise and recover the underlying searchParams object.
    } else {
      Object.defineProperty(promise, prop, {
        value: underlyingSearchParams[prop],
        writable: false,
        enumerable: true,
      })
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return ReflectAdapter.get(target, prop, receiver)
      } else if (typeof prop === 'symbol') {
        return undefined
      } else {
        const expression = describeStringPropertyAccess('searchParams', prop)
        warnForSyncAccess(expression)
        return underlyingSearchParams[prop]
      }
    },
    has(target, prop) {
      if (Reflect.has(target, prop)) {
        return true
      } else if (typeof prop === 'symbol') {
        // searchParams never has symbol properties containing searchParam data
        // and we didn't match above so we just return false here.
        return false
      } else {
        const expression = describeHasCheckingStringProperty(
          'searchParams',
          prop
        )
        warnForSyncAccess(expression)
        return Reflect.has(underlyingSearchParams, prop)
      }
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
  const promise = Promise.resolve(underlyingSearchParams)
  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
    },
    value: {
      value: underlyingSearchParams,
    },
  })

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (Reflect.has(promise, prop)) {
      // We can't assign a value over a property on the promise. The only way to
      // access this is if you await the promise and recover the underlying searchParams object.
    } else {
      Object.defineProperty(promise, prop, {
        value: underlyingSearchParams[prop],
        writable: false,
        enumerable: true,
      })
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
