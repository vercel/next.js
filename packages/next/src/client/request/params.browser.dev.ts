import type { Params } from '../../server/request/params'

import { ReflectAdapter } from '../../server/web/spec-extension/adapters/reflect'
import {
  describeStringPropertyAccess,
  wellKnownProperties,
} from '../../shared/lib/utils/reflect-utils'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeDynamicallyTrackedParamsWithDevWarnings(
  underlyingParams: Params
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

  Object.keys(underlyingParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      proxiedProperties.add(prop)
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
          warnForSyncAccess(expression)
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
      warnForEnumeration()
      return Reflect.ownKeys(target)
    },
  })

  CachedParams.set(underlyingParams, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(expression: string) {
  console.error(
    `A param property was accessed directly with ${expression}. ` +
      `\`params\` is a Promise and must be unwrapped with \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function warnForEnumeration() {
  console.error(
    `params are being enumerated. ` +
      `\`params\` is a Promise and must be unwrapped with \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

export function createRenderParamsFromClient(
  clientParams: Params
): Promise<Params> {
  return makeDynamicallyTrackedParamsWithDevWarnings(clientParams)
}
