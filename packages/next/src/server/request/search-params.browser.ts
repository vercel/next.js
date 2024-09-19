import type { SearchParams } from './search-params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'

export function reifyClientRenderSearchParams(
  underlying: SearchParams
): Promise<SearchParams> {
  if (process.env.NODE_ENV === 'development') {
    return makeUntrackedExoticSearchParamsWithDevWarnings(underlying)
  } else {
    return makeUntrackedExoticSearchParams(underlying)
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

function makeUntrackedExoticSearchParamsWithDevWarnings(
  underlying: SearchParams
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlying)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = Promise.resolve(underlying)
  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
    },
    value: {
      value: underlying,
    },
  })

  Object.keys(underlying).forEach((prop) => {
    if (Reflect.has(promise, prop)) {
      // We can't assign a value over a property on the promise. The only way to
      // access this is if you await the promise and recover the underlying searchParams object.
    } else {
      Object.defineProperty(promise, prop, {
        value: underlying[prop],
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
        const expression = describeStringPropertyAccess(prop)
        warnForSyncAccess(expression)
        return underlying[prop]
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
        const expression = describeHasCheckingStringProperty(prop)
        warnForSyncAccess(expression)
        return Reflect.has(underlying, prop)
      }
    },
    ownKeys(target) {
      warnForSyncSpread()
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlying, proxiedPromise)
  return proxiedPromise
}

function makeUntrackedExoticSearchParams(
  underlying: SearchParams
): Promise<SearchParams> {
  const promise = Promise.resolve(underlying)
  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
    },
    value: {
      value: underlying,
    },
  })

  Object.keys(underlying).forEach((prop) => {
    if (Reflect.has(promise, prop)) {
      // We can't assign a value over a property on the promise. The only way to
      // access this is if you await the promise and recover the underlying searchParams object.
    } else {
      Object.defineProperty(promise, prop, {
        value: underlying[prop],
        writable: false,
        enumerable: true,
      })
    }
  })

  return promise
}

function warnForSyncAccess(expression: string) {
  console.error(
    `A searchParam property was accessed directly with ${expression}. \`searchParams\` is now a Promise and should be awaited before accessing properties of the underlying searchParams object. In this version of Next.js direct access to searchParam properties is still supported to faciliate migration but in a future version you will be required to await \`searchParams\`. If this use is inside an async function await it. If this use is inside a synchronous function then convert the function to async or await it from outside this function and pass the result in.`
  )
}

function warnForSyncSpread() {
  console.error(
    `the keys of \`searchParams\` were accessed through something like \`Object.keys(searchParams)\` or \`{...searchParams}\`. \`searchParams\` is now a Promise and should be awaited before accessing properties of the underlying searchParams object. In this version of Next.js direct access to searchParam properties is still supported to faciliate migration but in a future version you will be required to await \`searchParams\`. If this use is inside an async function await it. If this use is inside a synchronous function then convert the function to async or await it from outside this function and pass the result in.`
  )
}

// This regex will have fast negatives meaning valid identifiers may not pass
// this test. However this is only used during static generation to provide hints
// about why a page bailed out of some or all prerendering and we can use bracket notation
// for example while `ಠ_ಠ` is a valid identifier it's ok to print `searchParams['ಠ_ಠ']`
// even if this would have been fine too `searchParams.ಠ_ಠ`
const isDefinitelyAValidIdentifer = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function describeStringPropertyAccess(prop: string) {
  if (isDefinitelyAValidIdentifer.test(prop)) {
    return `\`searchParams.${prop}\``
  }
  return `\`searchParams[${JSON.stringify(prop)}]\``
}

function describeHasCheckingStringProperty(prop: string) {
  return `\`${JSON.stringify(prop)} in searchParams\``
}
