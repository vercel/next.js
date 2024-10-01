import type { Params } from './params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import { InvariantError } from '../../shared/lib/invariant-error'
import { describeStringPropertyAccess } from './utils'

export function createRenderParamsFromClient(underlyingParams: Params) {
  if (process.env.NODE_ENV === 'development') {
    return makeDynamicallyTrackedExoticParamsWithDevWarnings(underlyingParams)
  } else {
    return makeUntrackedExoticParams(underlyingParams)
  }
}

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeUntrackedExoticParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlyingParams,
      writable: true,
    },
  })

  Object.keys(underlyingParams).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'value':
      case 'status': {
        // These properties cannot be shadowed with a search param because they
        // are necessary for ReactPromise's to work correctly with `use`
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
  underlyingParams: Params
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlyingParams,
      writable: true,
    },
  })

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []

  Object.keys(underlyingParams).forEach((prop) => {
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
        ;(promise as any)[prop] = underlyingParams[prop]
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
          const expression = describeStringPropertyAccess('params', prop)
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

  CachedParams.set(underlyingParams, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(expression: string) {
  console.error(
    `A param property was accessed directly with ${expression}. \`params\` is now a Promise and should be unwrapped with \`React.use()\` before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to facilitate migration but in a future version you will be required to unwrap \`params\` with \`React.use()\`.`
  )
}

function warnForEnumeration(missingProperties: Array<string>) {
  if (missingProperties.length) {
    const describedMissingProperties =
      describeListOfPropertyNames(missingProperties)
    console.error(
      `params are being enumerated incompletely missing these properties: ${describedMissingProperties}. ` +
        `\`params\` should be unwrapped with \`React.use()\` before using its value. ` +
        `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
    )
  } else {
    console.error(
      `params are being enumerated. ` +
        `\`params\` should be unwrapped with \`React.use()\` before using its value. ` +
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
