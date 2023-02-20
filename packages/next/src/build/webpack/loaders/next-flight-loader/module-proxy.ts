/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Modified from https://github.com/facebook/react/blob/main/packages/react-server-dom-webpack/src/ReactFlightWebpackNodeRegister.js

const CLIENT_REFERENCE = Symbol.for('react.client.reference')
const PROMISE_PROTOTYPE = Promise.prototype

const deepProxyHandlers = {
  get: function (target: any, name: string, _receiver: ProxyHandler<any>) {
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
      case 'displayName':
        return undefined
      case 'async':
        return target.async
      // We need to special case this because createElement reads it if we pass this
      // reference.
      case 'defaultProps':
        return undefined
      // Avoid this attempting to be serialized.
      case 'toJSON':
        return undefined
      case Symbol.toPrimitive.toString():
        // @ts-ignore
        return Object.prototype[Symbol.toPrimitive]
      case 'Provider':
        throw new Error(
          `Cannot render a Client Context Provider on the Server. ` +
            `Instead, you can export a Client Component wrapper ` +
            `that itself renders a Client Context Provider.`
        )
      default:
        break
    }
    let expression
    switch (target.name) {
      case '':
        expression = String(name)
        break
      case '*':
        expression = String(name)
        break
      default:
        expression = String(target.name) + '.' + String(name)
    }
    throw new Error(
      `Cannot access ${expression} on the server. ` +
        'You cannot dot into a client module from a server component. ' +
        'You can only pass the imported name through.'
    )
  },
  set: function () {
    throw new Error('Cannot assign to a client module from a server module.')
  },
}

const proxyHandlers = {
  get: function (target: any, name: string, _receiver: ProxyHandler<any>) {
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
      // Avoid this attempting to be serialized.
      case 'toJSON':
        return undefined
      case Symbol.toPrimitive.toString():
        // @ts-ignore
        return Object.prototype[Symbol.toPrimitive]
      case '__esModule':
        // Something is conditionally checking which export to use. We'll pretend to be
        // an ESM compat module but then we'll check again on the client.
        const moduleId = target.filepath
        target.default = Object.defineProperties(
          function () {
            throw new Error(
              `Attempted to call the default export of ${moduleId} from the server ` +
                `but it's on the client. It's not possible to invoke a client function from ` +
                `the server, it can only be rendered as a Component or passed to props of a ` +
                `Client Component.`
            )
          },
          {
            // This a placeholder value that tells the client to conditionally use the
            // whole object or just the default export.
            name: { value: '' },
            $$typeof: { value: CLIENT_REFERENCE },
            filepath: { value: target.filepath },
            async: { value: target.async },
          }
        )
        return true
      case 'then':
        if (target.then) {
          // Use a cached value
          return target.then
        }
        if (!target.async) {
          // If this module is expected to return a Promise (such as an AsyncModule) then
          // we should resolve that with a client reference that unwraps the Promise on
          // the client.

          const clientReference = Object.defineProperties(
            {},
            {
              // Represents the whole Module object instead of a particular import.
              name: { value: '*' },
              $$typeof: { value: CLIENT_REFERENCE },
              filepath: { value: target.filepath },
              async: { value: true },
            }
          )
          const proxy = new Proxy(clientReference, proxyHandlers)

          // Treat this as a resolved Promise for React's use()
          target.status = 'fulfilled'
          target.value = proxy

          const then = (target.then = Object.defineProperties(
            function then(resolve: any, _reject: any) {
              // Expose to React.
              return Promise.resolve(
                // $FlowFixMe[incompatible-call] found when upgrading Flow
                resolve(proxy)
              )
            },
            // If this is not used as a Promise but is treated as a reference to a `.then`
            // export then we should treat it as a reference to that name.
            {
              name: { value: 'then' },
              $$typeof: { value: CLIENT_REFERENCE },
              filepath: { value: target.filepath },
              async: { value: false },
            }
          ))
          return then
        } else {
          // Since typeof .then === 'function' is a feature test we'd continue recursing
          // indefinitely if we return a function. Instead, we return an object reference
          // if we check further.
          return undefined
        }
      default:
        break
    }
    let cachedReference = target[name]
    if (!cachedReference) {
      const reference = Object.defineProperties(
        function () {
          throw new Error(
            `Attempted to call ${String(name)}() from the server but ${String(
              name
            )} is on the client. ` +
              `It's not possible to invoke a client function from the server, it can ` +
              `only be rendered as a Component or passed to props of a Client Component.`
          )
        },
        {
          name: { value: name },
          $$typeof: { value: CLIENT_REFERENCE },
          filepath: { value: target.filepath },
          async: { value: target.async },
        }
      )
      cachedReference = target[name] = new Proxy(reference, deepProxyHandlers)
    }
    return cachedReference
  },
  getPrototypeOf(_target: any): object {
    // Pretend to be a Promise in case anyone asks.
    return PROMISE_PROTOTYPE
  },
  set: function () {
    throw new Error('Cannot assign to a client module from a server module.')
  },
}

export function createProxy(moduleId: string) {
  const clientReference = Object.defineProperties(
    {},
    {
      // Represents the whole object instead of a particular import.
      name: { value: '*' },
      $$typeof: { value: CLIENT_REFERENCE },
      filepath: { value: moduleId },
      async: { value: false },
    }
  )
  return new Proxy(clientReference, proxyHandlers)
}
