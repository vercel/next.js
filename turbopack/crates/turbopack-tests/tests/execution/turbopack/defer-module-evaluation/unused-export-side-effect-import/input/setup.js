const { AsyncLocalStorage } = require('node:async_hooks')

globalThis.deferEvents = []
// What a server keeps for the request that it handles.
globalThis.deferRequest = new AsyncLocalStorage()
