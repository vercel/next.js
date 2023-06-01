// This file should be imported before any others. It sets up the environment
// for later imports to work properly.

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
if (typeof (globalThis as any).AsyncLocalStorage !== 'function') {
  const { AsyncLocalStorage } = require('async_hooks')
  ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage
}

if (typeof (globalThis as any).WebSocket !== 'function') {
  let WebSocket
  // undici's WebSocket handling is only available in Node.js >= 18
  // so fallback to using ws for v16
  if (Number(process.version.split('.')[0].substring(1)) < 18) {
    WebSocket = require('next/dist/compiled/ws').WebSocket
  } else {
    WebSocket = require('next/dist/compiled/undici').WebSocket
  }
  ;(globalThis as any).WebSocket = WebSocket
}
