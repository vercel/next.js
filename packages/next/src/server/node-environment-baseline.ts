// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

const { AsyncLocalStorage, AsyncResource } =
  require('async_hooks') as typeof import('async_hooks')

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
if (typeof (globalThis as any).AsyncLocalStorage !== 'function') {
  ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage
}

// `app-render/async-local-storage` takes snapshots of the async context with
// `AsyncResource` when the global `AsyncLocalStorage` is the one of Node.js.
// That module is also bundled for the Edge runtime and for the browser, so it
// can't require `async_hooks` itself and reads both classes from here.
;(globalThis as any)[Symbol.for('@next/node-async-hooks')] = {
  AsyncLocalStorage,
  AsyncResource,
}

if (typeof globalThis.WebSocket !== 'function') {
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    get() {
      return (
        require('next/dist/compiled/ws') as typeof import('next/dist/compiled/ws')
      ).WebSocket
    },
    set(value) {
      Object.defineProperty(globalThis, 'WebSocket', {
        configurable: true,
        writable: true,
        value,
      })
    },
  })
}
