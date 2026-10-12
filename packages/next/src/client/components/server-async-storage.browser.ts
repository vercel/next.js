// Browser variant of `./server-async-storage`. The server-only async-storage
// singletons don't exist in the browser, so these are `undefined`. Consumers
// guard usage behind `typeof window === 'undefined'`, so the stubs are never
// dereferenced.
export const actionAsyncStorage = undefined
export const workAsyncStorage = undefined
export const workUnitAsyncStorage = undefined
