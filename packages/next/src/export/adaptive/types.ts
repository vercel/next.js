import type {
  ExportPagesInput,
  ExportPagesResult,
  ExportPathEntry,
} from '../types'
import type { StaticGenerationPhase } from '../static-generation-profile'

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
  /**
   * The build failed: drop the pages this worker has not started yet and
   * return right away. Pages already rendering can't be stopped.
   */
  cancel?: boolean
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
  /** Lowest advisory heap reading at recent major GC event deliveries. */
  postGcFloor: number | undefined
}

export type AdaptiveStepResult = {
  workerId: string
  /** The worker has no state for this session; resend with `session`. */
  needsSession?: boolean
  results: Array<
    {
      id: number
      /**
       * Heap in use divided by pages in flight when this page finished: a
       * rough per-page memory cost for route statistics.
       */
      heapPerPage?: number
    } & ExportPagesResult[number]
  >
  /** Submitted pages the worker did not accept. */
  refused: number[]
  status: AdaptiveWorkerStatus
}
