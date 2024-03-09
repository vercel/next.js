import type { TraceEvent } from '../types'

export type Reporter = {
  flushAll: () => Promise<void> | void
  report: (event: TraceEvent) => void
}
