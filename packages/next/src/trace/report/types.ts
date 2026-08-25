import type { TraceEvent } from '../types'

export type Reporter = {
  flushAll: () => void
  report: (event: TraceEvent) => void
  /**
   * Release any file handles. Optional: only reporters that hold one need it,
   * and only callers that must act on the file afterwards (tests removing a
   * temp dir on Windows) need to call it.
   */
  close?: () => void
}
