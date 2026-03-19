import { instrumentationDepEvaluatedAt } from './instrumentation-dep'

// Set at module scope so server HMR re-evaluation updates these globals
;(globalThis as any).__instrumentationVersion = 'v0'
;(globalThis as any).__instrumentationDepEvaluatedAt = instrumentationDepEvaluatedAt

export function register() {}
