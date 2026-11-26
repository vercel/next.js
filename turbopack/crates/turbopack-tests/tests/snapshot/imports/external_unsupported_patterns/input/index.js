globalThis.requireExternal = () => require('node:async_hooks')
globalThis.importExternal = () => import('node:async_hooks')
globalThis.resolveExternal = () => require.resolve('node:async_hooks')

let request
if (Math.random() > 0.5) {
  request = 'node:async_hooks'
} else {
  request = 'node:fs'
}
globalThis.requireExternalPattern = () => require(request)
globalThis.importExternalPattern = () => import(request)
globalThis.resolveExternalPattern = () => require.resolve(request)
