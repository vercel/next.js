import { AsyncLocalStorage } from 'node:async_hooks'

// What an application keeps for the request that it handles.
export const requestStore = new AsyncLocalStorage<string>()
