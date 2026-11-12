import type {
  ExportPagesInput,
  ExportPagesResult,
  ExportPathEntry,
} from '../types'
import type { StaticGenerationPhase } from '../static-generation-profile'

/**
 * A worker that exits with this code asked to be restarted (recycled) because
 * its memory baseline crept up. jest-worker restarts it.
 */
export const RECYCLE_EXIT_CODE = 75

/**
 * A worker that exits with this code was about to run out of heap. jest-worker
 * restarts it, and the scheduler retries its pages one at a time.
 */
export const MEMORY_PRESSURE_EXIT_CODE = 76

/** Exit codes from which the static worker pool recovers on its own. */
export const RECOVERABLE_EXIT_CODES: ReadonlySet<number> = new Set([
  RECYCLE_EXIT_CODE,
  MEMORY_PRESSURE_EXIT_CODE,
])

/** Everything an adaptive session needs that doesn't change per page. */
export type AdaptiveSessionInput = Omit<
  ExportPagesInput,
  'exportPaths' | 'renderResumeDataCachesByPage' | 'phase' | 'placement'
>

export type AdaptiveTaskInput = {
  id: number
  exportPath: ExportPathEntry
  renderResumeDataCache?: string
  /** Render this page alone, with nothing else in flight on the worker. */
  isolate?: boolean
  /** Why this page was sent to this worker (for profiling). */
  placement?: string
  /** Set by the worker from the step's phase. */
  phase?: StaticGenerationPhase
}

export type AdaptiveStepInput = {
  sessionId: string
  /** Scheduler slot; jest-worker pins each slot to one worker. */
  slot: number
  phase: StaticGenerationPhase
  /** Sent until the worker confirms it has the session. */
  session?: AdaptiveSessionInput
  submit: AdaptiveTaskInput[]
  /**
   * `capacity`: return once the worker could take more pages.
   * `drained`: return once the worker has nothing in flight.
   */
  wait: 'capacity' | 'drained'
  limits: {
    /** Upper bound for pages in flight on this worker. */
    maxConcurrency: number | undefined
    /** RSS budget for this worker, from the machine-wide budget. */
    rssLimit: number | undefined
  }
  /** Exit to be restarted if this is still the worker with this id. */
  recycleWorkerId?: string
}

export type AdaptiveWorkerStatus = {
  workerId: string
  running: number
  queued: number
  /** Pages the worker would accept right now. */
  capacity: number
  concurrency: number
  saturated: boolean
  elu: number
  /** Allocated memory: JS heap plus external (buffer) memory. */
  rss: number
  /** Resident set size. */
  rawRss: number
  heapUsed: number
  heapLimit: number
  memoryUsage: number
  memoryPerPage: number | undefined
  /** Lowest post-GC heap over the last few major GCs. */
  postGcFloor: number | undefined
}

export type AdaptiveStepResult = {
  workerId: string
  /** The worker has no state for this session; resend with `session`. */
  needsSession?: boolean
  results: Array<{ id: number } & ExportPagesResult[number]>
  /** Submitted pages the worker did not accept. */
  refused: number[]
  status: AdaptiveWorkerStatus
}
