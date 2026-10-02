// Client-safe access to the server-only async-storage singletons. On the
// server these re-export the real storages; in the browser bundle this module
// is aliased to `./server-async-storage.browser` (see
// scripts/generate-browser-variant-aliases.mjs), which exports `undefined`
// stubs so the AsyncLocalStorage modules are never bundled into the client.
// Consumers must guard usage so the stubs are not dereferenced in the browser.
export { actionAsyncStorage } from '../../server/app-render/action-async-storage.external'
export { workAsyncStorage } from '../../server/app-render/work-async-storage.external'
export { workUnitAsyncStorage } from '../../server/app-render/work-unit-async-storage.external'
