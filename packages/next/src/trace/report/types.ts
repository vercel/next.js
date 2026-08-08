import type { TraceEvent } from '../types'

export type Reporter = {
  flushAll: () => void
  report: (event: TraceEvent) => void
}
