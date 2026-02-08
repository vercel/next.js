// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

// Replace global WebStream constructors with faster Node.js-backed implementations.
// Must run synchronously before any code captures references to globalThis.ReadableStream etc.
{
  const {
    patchGlobalWebStreams,
  } = (require('next/dist/compiled/fast-webstreams/patch.js') as typeof import('next/dist/compiled/fast-webstreams/patch.js'))
  patchGlobalWebStreams()
}

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
if (typeof (globalThis as any).AsyncLocalStorage !== 'function') {
  const { AsyncLocalStorage } =
    require('async_hooks') as typeof import('async_hooks')
  ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage
}

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
