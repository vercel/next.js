const { AsyncLocalStorage, AsyncResource } = require('node:async_hooks')

globalThis.deferEvents = []
globalThis.deferAsyncHooks = { AsyncLocalStorage, AsyncResource }
// What a server keeps for the request that it handles.
globalThis.deferRequest = new AsyncLocalStorage()
