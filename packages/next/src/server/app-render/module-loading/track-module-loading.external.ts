// NOTE: this is marked as shared/external because it's stateful
// and the state needs to be shared between app-render (which waits for pending imports)
// and helpers used in transformed page code (which register pending imports)

import {
  diffModuleLoadingMetrics,
  getModuleLoadingMetricsSnapshot,
  trackPendingChunkLoad,
  trackPendingImport,
  trackPendingModules,
} from './track-module-loading.instance' with { 'turbopack-transition': 'next-shared' }

export {
  diffModuleLoadingMetrics,
  getModuleLoadingMetricsSnapshot,
  trackPendingChunkLoad,
  trackPendingImport,
  trackPendingModules,
}
