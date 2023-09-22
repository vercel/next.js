// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
if (typeof (globalThis as any).AsyncLocalStorage !== 'function') {
  const { AsyncLocalStorage } = require('async_hooks')
  ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage
}

if (typeof (globalThis as any).WebSocket !== 'function') {
  Object.defineProperty(globalThis, 'WebSocket', {
    get() {
      return require('next/dist/compiled/ws').WebSocket
    },
  })
}

// This adds a `Promise.withResolvers` polyfill. This will soon be adopted into
// the spec.
//
// TODO: remove this polyfill when it is adopted into the spec.
//
// https://tc39.es/proposal-promise-with-resolvers/
//
if (
  !('withResolvers' in Promise) ||
  typeof Promise.withResolvers !== 'function'
) {
  Promise.withResolvers = <T>() => {
    let resolvers: {
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason: any) => void
    }

    // Create the promise and assign the resolvers to the object.
    const promise = new Promise<T>((resolve, reject) => {
      resolvers = { resolve, reject }
    })

    // We know that resolvers is defined because the Promise constructor runs
    // synchronously.
    return { promise, resolve: resolvers!.resolve, reject: resolvers!.reject }
  }
}
