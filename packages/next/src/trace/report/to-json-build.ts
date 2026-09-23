import { traceGlobals } from '../shared'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import { createJsonReporter } from './to-json'

const allowlistedEvents = new Set([
  'next-build',
  'run-turbopack',
  'run-webpack',
  'run-typescript',
  'run-eslint',
  'static-check',
  'collect-build-traces',
  'static-generation',
  'output-export-full-static-export',
  'adapter-handle-build-complete',
  'adapter-load',
  'adapter-load-immutable-static-hashes',
  'adapter-collect-outputs',
  'adapter-collect-static-files',
  'adapter-collect-shared-node-assets',
  'adapter-collect-pages',
  'adapter-collect-middleware',
  'adapter-collect-app-paths',
  'adapter-collect-prerenders',
  'adapter-collect-dynamic-prerenders',
  'adapter-collect-error-pages',
  'adapter-build-routing',
  'adapter-build-dynamic-routes',
  'adapter-build-data-routes',
  'adapter-on-build-complete',
  'output-standalone',
  'telemetry-flush',
  'turbopack-persistence',
  'turbopack-compaction',
  'turbopack-module-graph',
  'turbopack-write-entrypoints',
  'turbopack-emit',
])

export default createJsonReporter({
  filename: 'trace-build',
  sizeLimit: Infinity,
  filter: (event) => {
    const phase = traceGlobals.get('phase')
    return phase === PHASE_PRODUCTION_BUILD && allowlistedEvents.has(event.name)
  },
})
