// What `io-utils` needs to report a synchronous IO access. `io-utils` loads
// this module with one `require()` when it first has something to report. The
// re-exports name exactly what is used, so a bundler that includes this module
// can still drop the rest of the modules below.
export { abortOnSynchronousPlatformIOAccess } from '../app-render/dynamic-rendering'
export { RenderStage } from '../app-render/staged-rendering'
export { applyOwnerStack } from '../dynamic-rendering-utils'
export {
  createSyncIOClientError,
  createSyncIOError,
  createSyncIORuntimeError,
} from '../app-render/sync-io-messages'
