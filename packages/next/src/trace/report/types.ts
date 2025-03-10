import type { TraceEvent } from '../types'

export type Reporter = {
  flushAll: (opts?: { end: boolean }) => Promise<void> | void
  report: (event: TraceEvent) => void
}
