/**
 * Worker-side half of the adaptive static generation scheduler.
 *
 * A session lives for one `exportApp` run in one worker. It keeps a local
 * queue of accepted pages and renders up to the admission controller's window
 * at once. Each step call from the orchestrator submits pages (the worker may
 * refuse some), then resolves once the worker could take more pages (or has
 * drained), returning whatever finished since the last step plus live
 * metrics. In-flight pages keep rendering between steps.
 */
import {
  AdmissionController,
  type AdmissionConfig,
} from './admission-controller'
import type {
  AdaptiveStepInput,
  AdaptiveStepResult,
  AdaptiveTaskInput,
  AdaptiveWorkerStatus,
} from './types'
import type { ExportPagesResult } from '../types'

export type MemorySnapshot = {
  /** Event loop utilization since the previous snapshot, 0..1. */
  elu: number
  heapUsed: number
  /** Resident set size of this worker, or 0 in worker thread mode. */
  rss: number
  /** JS heap plus external (buffer) memory; see `MemoryMonitor`. */
  liveRss: number
  heapLimit: number
  /** Advisory heap observed when the latest major GC event was delivered. */
  postGcHeap: number | undefined
  /** Lowest advisory heap reading at recent major GC event deliveries. */
  postGcFloor: number | undefined
}

export type WorkerSessionOptions = {
  workerId: string
  config: AdmissionConfig
  exportPage: (task: AdaptiveTaskInput) => Promise<ExportPagesResult[number]>
  readMemory: () => MemorySnapshot
  now: () => number
}

export class AdaptiveWorkerSession {
  private readonly controller: AdmissionController
  private readonly queue: AdaptiveTaskInput[] = []
  private running = 0
  private runningIsolated = false
  private completed: Array<
    { id: number; heapPerPage?: number } & ExportPagesResult[number]
  > = []
  private fatalError: { error: unknown } | undefined
  private waiters = new Set<() => void>()
  private rssLimit: number | undefined
  private memory: MemorySnapshot | undefined

  constructor(private readonly options: WorkerSessionOptions) {
    this.controller = new AdmissionController(options.config)
  }

  /** Feed a fresh metrics sample to the controller (called on a timer). */
  tick(): void {
    const memory = this.options.readMemory()
    this.memory = memory
    this.updateAdmission(memory)
    this.pump()
    this.notify()
  }

  private updateAdmission(memory: MemorySnapshot): void {
    this.controller.update({
      now: this.options.now(),
      elu: memory.elu,
      heapUsed: memory.heapUsed,
      postGcHeap: memory.postGcHeap,
      rss: memory.liveRss,
      rawRss: memory.rss,
      running: this.running,
      heapLimit: memory.heapLimit,
      rssLimit: this.rssLimit,
    })
  }

  get idle(): boolean {
    return this.running === 0 && this.queue.length === 0
  }

  private prefetch(): number {
    return Math.max(2, Math.ceil(this.controller.concurrency / 4))
  }

  private capacity(): number {
    return this.controller.acceptable(
      this.running,
      this.queue.length,
      this.prefetch()
    )
  }

  status(): AdaptiveWorkerStatus {
    const state = this.controller.state
    const memory = this.memory
    return {
      workerId: this.options.workerId,
      running: this.running,
      queued: this.queue.length,
      capacity: this.capacity(),
      concurrency: state.limit,
      saturated: state.saturated,
      elu: state.elu,
      rss: memory?.liveRss ?? 0,
      rawRss: memory?.rss ?? 0,
      heapUsed: memory?.heapUsed ?? 0,
      heapLimit: memory?.heapLimit ?? 0,
      memoryUsage: state.memoryUsage,
      memoryPerPage: state.memoryPerPage,
      postGcFloor: memory?.postGcFloor,
    }
  }

  async step(input: AdaptiveStepInput): Promise<AdaptiveStepResult> {
    this.throwIfFailed()

    const limitChanged = this.rssLimit !== input.limits.rssLimit
    this.rssLimit = input.limits.rssLimit
    if (!this.memory) this.tick()
    else if (limitChanged) this.updateAdmission(this.memory)

    const refused: number[] = []
    for (const task of input.submit) {
      if (this.capacity() > 0 || (task.isolate && this.idle)) {
        this.queue.push(task)
      } else {
        refused.push(task.id)
      }
    }
    this.pump()

    // Refused pages should be rerouted right away.
    if (refused.length === 0) {
      await this.waitUntil(() =>
        input.wait === 'drained'
          ? this.idle
          : this.idle || (this.queue.length === 0 && this.capacity() > 0)
      )
    }

    this.throwIfFailed()

    const results = this.completed
    this.completed = []
    return {
      workerId: this.options.workerId,
      results,
      refused,
      status: this.status(),
    }
  }

  private throwIfFailed(): void {
    if (this.fatalError) throw this.fatalError.error
  }

  private pump(): void {
    // A fatal export stops the session, including later ticks and completions
    // of pages that were already running when it failed.
    if (this.fatalError) return

    while (this.queue.length > 0 && !this.runningIsolated) {
      const next = this.queue[0]
      if (next.isolate) {
        if (this.running > 0) return
        this.queue.shift()
        this.runningIsolated = true
        this.start(next)
        return
      }
      if (this.running >= this.controller.concurrency) return
      this.queue.shift()
      this.start(next)
    }
  }

  private start(task: AdaptiveTaskInput): void {
    this.running++
    this.options
      .exportPage(task)
      .then(
        (result) => {
          const heapUsed = this.memory?.heapUsed
          this.completed.push({
            id: task.id,
            heapPerPage:
              heapUsed !== undefined
                ? heapUsed / Math.max(1, this.running)
                : undefined,
            ...result,
          })
        },
        (error) => {
          this.fatalError ??= { error }
        }
      )
      .finally(() => {
        this.running--
        if (task.isolate) this.runningIsolated = false
        this.pump()
        this.notify()
      })
  }

  private notify(): void {
    for (const waiter of [...this.waiters]) waiter()
  }

  private waitUntil(condition: () => boolean): Promise<void> {
    if (condition() || this.fatalError) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const check = () => {
        if (condition() || this.fatalError) {
          this.waiters.delete(check)
          resolve()
        }
      }
      this.waiters.add(check)
    })
  }
}
