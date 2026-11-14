// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
// TODO(as-any): pre-existing cast, not yet reviewed
// eslint-disable-next-line @next/internal/no-as-any
if (typeof (globalThis as any).AsyncLocalStorage !== 'function') {
  const { AsyncLocalStorage } =
    require('async_hooks') as typeof import('async_hooks')
  // TODO(as-any): pre-existing cast, not yet reviewed
  // eslint-disable-next-line @next/internal/no-as-any
  ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage
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
