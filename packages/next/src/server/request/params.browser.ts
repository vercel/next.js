import type { Params } from './params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import { InvariantError } from '../../shared/lib/invariant-error'

export function reifyClientRenderParams(underlying: Params) {
  if (process.env.NODE_ENV === 'development') {
    return makeDynamicallyTrackedExoticParamsWithDevWarnings(underlying)
  } else {
    return makeUntrackedExoticParams(underlying)
  }
}

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

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
  underlying: Params
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
          proxiedProperties.has(prop) ||
          // We are accessing a property that doesn't exist on the promise nor the underlying
          Reflect.has(target, prop) === false
        ) {
          const expression = describeStringPropertyAccess(prop)
          warnForSyncAccess(expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    ownKeys(target) {
      warnForEnumeration(unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedParams.set(underlying, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(expression: string) {
  console.error(
    `A param property was accessed directly with ${expression}. \`params\` is now a Promise and should be awaited before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to faciliate migration but in a future version you will be required to await \`params\`. If this use is inside an async function await it. If this use is inside a synchronous function then convert the function to async or await it from outside this function and pass the result in.`
  )
}

function warnForEnumeration(missingProperties: Array<string>) {
  if (missingProperties.length) {
    const describedMissingProperties =
      describeListOfPropertyNames(missingProperties)
    console.error(
      `params are being enumerated incompletely with \`{...params}\`, \`Object.keys(params)\`, or similar. The following properties were not copied: ${describedMissingProperties}. \`params\` is now a Promise, however in the current version of Next.js direct access to the underlying params object is still supported to faciliate migration to the new type. param names that conflict with Promise properties cannot be accessed directly and must be accessed by first awaiting the \`params\` promise.`
    )
  } else {
    console.error(
      `params are being enumerated with \`{...params}\`, \`Object.keys(params)\`, or similar. \`params\` is now a Promise, however in the current version of Next.js direct access to the underlying params object is still supported to faciliate migration to the new type. You should update your code to await \`params\` before accessing its properties.`
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
const isDefinitelyAValidIdentifer = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function describeStringPropertyAccess(prop: string) {
  if (isDefinitelyAValidIdentifer.test(prop)) {
    return `\`params.${prop}\``
  }
  return `\`params[${JSON.stringify(prop)}]\``
}
