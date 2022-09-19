/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Modified from https://github.com/facebook/react/blob/main/packages/react-server-dom-webpack/src/ReactFlightWebpackNodeRegister.js

const MODULE_REFERENCE = Symbol.for('react.module.reference')
const PROMISE_PROTOTYPE = Promise.prototype

const proxyHandlers: ProxyHandler<object> = {
  get: function (target: any, name: string, _receiver: any) {
    switch (name) {
      // These names are read by the Flight runtime if you end up using the exports object.
      case '$$typeof':
        // These names are a little too common. We should probably have a way to
        // have the Flight runtime extract the inner target instead.
        return target.$$typeof
      case 'filepath':
        return target.filepath
      case 'name':
        return target.name
      case 'async':
        return target.async
      // We need to special case this because createElement reads it if we pass this
      // reference.
      case 'defaultProps':
        return undefined
      case '__esModule':
        // Something is conditionally checking which export to use. We'll pretend to be
        // an ESM compat module but then we'll check again on the client.
        target.default = {
          $$typeof: MODULE_REFERENCE,
          filepath: target.filepath,
          // This a placeholder value that tells the client to conditionally use the
          // whole object or just the default export.
          name: '',
          async: target.async,
        }
        return true
      case 'then':
        if (!target.async) {
          // If this module is expected to return a Promise (such as an AsyncModule) then
          // we should resolve that with a client reference that unwraps the Promise on
          // the client.
          const then = function then(
            resolve: (res: any) => void,
            _reject: (err: any) => void
          ) {
            const moduleReference: Record<string, any> = {
              $$typeof: MODULE_REFERENCE,
              filepath: target.filepath,
              name: '*', // Represents the whole object instead of a particular import.
              async: true,
            }
            return Promise.resolve(
              resolve(new Proxy(moduleReference, proxyHandlers))
            )
          }
          // If this is not used as a Promise but is treated as a reference to a `.then`
          // export then we should treat it as a reference to that name.
          then.$$typeof = MODULE_REFERENCE
          then.filepath = target.filepath
          // then.name is conveniently already "then" which is the export name we need.
          // This will break if it's minified though.
          return then
        }
        break
      default:
        break
    }
    let cachedReference = target[name]
    if (!cachedReference) {
      cachedReference = target[name] = {
        $$typeof: MODULE_REFERENCE,
        filepath: target.filepath,
        name: name,
        async: target.async,
      }
    }
    return cachedReference
  },
  getPrototypeOf(_target: object) {
    // Pretend to be a Promise in case anyone asks.
    return PROMISE_PROTOTYPE
  },
  set: function () {
    throw new Error('Cannot assign to a client module from a server module.')
  },
}

export function createProxy(moduleId: string) {
  const moduleReference = {
    $$typeof: MODULE_REFERENCE,
    filepath: moduleId,
    name: '*', // Represents the whole object instead of a particular import.
    async: false,
  }
  return new Proxy(moduleReference, proxyHandlers)
}
