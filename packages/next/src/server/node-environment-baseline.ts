// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
if (typeof (globalThis as any).AsyncLocalStorage !== 'function') {
  const { AsyncLocalStorage } =
    require('async_hooks') as typeof import('async_hooks')
  ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage
}

// Install a Proxy sentinel for __NEXT_INVARIANTS__ that throws if any property
// is accessed before the config values are initialized. This catches too-early
// access during module loading before the server or build has resolved config.
;(globalThis as any).__NEXT_INVARIANTS__ = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(
        `__NEXT_INVARIANTS__.${String(prop)} was accessed before initialization`
      )
    },
    set(_target, prop) {
      throw new Error(
        `Cannot assign to __NEXT_INVARIANTS__.${String(prop)} directly, use initializeNextInvariants()`
      )
    },
  }
)

if (typeof (globalThis as any).WebSocket !== 'function') {
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
