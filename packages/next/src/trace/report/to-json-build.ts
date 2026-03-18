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
  'output-standalone',
  'telemetry-flush',
  'turbopack-build-events',
  'turbopack-persistence',
  'turbopack-compaction',
])

export default createJsonReporter({
  filename: 'trace-build',
  sizeLimit: Infinity,
  filter: (event) => {
    const phase = traceGlobals.get('phase')
    return phase === PHASE_PRODUCTION_BUILD && allowlistedEvents.has(event.name)
  },
})
