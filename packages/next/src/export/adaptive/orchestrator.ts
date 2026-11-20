/**
 * Parent-side scheduler for adaptive static generation.
 *
 * Pages wait in a route-affine queue (see `route-queue.ts`): each worker
 * claims a route and works through it in order, and helps with other routes
 * from their end only when every remaining route is owned. Each worker slot
 * has at most one step call
 * in flight (jest-worker runs one call per worker at a time). A step hands the
 * worker a chunk of pages and returns as soon as the worker could take more,
 * while earlier pages keep rendering, so a worker never drains to zero
 * between chunks. Workers report live metrics with every step result; the
 * orchestrator uses them to size the next chunk, to prefer workers with
 * headroom and to keep total worker memory under the machine budget. Pages
 * lost in a worker crash are retried one at a time.
 *
 * This module has no Node or jest-worker dependencies: everything it needs
 * is injected, so it can be tested with fake workers.
 */
import type { ExportPagesResult, ExportPathEntry } from '../types'
import type { StaticGenerationPhase } from '../static-generation-profile'
import type {
  AdaptiveSessionInput,
  AdaptiveStepInput,
  AdaptiveStepResult,
  AdaptiveTaskInput,
  AdaptiveWorkerStatus,
} from './types'
import { RouteQueue } from './route-queue'

type Task = {
  id: number
  /** The page (route) this path belongs to. */
  route: string
  exportPath: ExportPathEntry
  crashes: number
  isolate: boolean
  placement: string
  /** Handed out by the route queue and not yet completed or returned. */
  fromRouteQueue: boolean
}

type Slot = {
  index: number
  busy: boolean
  /** A cancel step was sent after the build failed. */
  cancelled: boolean
  sessionReady: boolean
  workerId: string | undefined
  status: AdaptiveWorkerStatus | undefined
  consecutiveErrors: number
}

export type AdaptiveOrchestratorOptions = {
  exportPaths: ExportPathEntry[]
  phase: StaticGenerationPhase
  sessionId: string
  session: AdaptiveSessionInput
  renderResumeDataCachesByPage?: Record<string, string>
  getPageKey: (exportPath: ExportPathEntry) => string
  /** Worker slots to schedule pages on. */
  numSlots: number
  chunkSize: number
  /** User cap for pages in flight per worker, if configured. */
  maxConcurrency: number | undefined
  /** Memory available to the whole build (container limit or total RAM). */
  machineMemoryLimit: number
  memory: {
    /** Parent RSS in process mode; whole-process RSS in thread mode. */
    getRss: () => number
    /** Allocations retained by pool workers outside this phase's slots. */
    getIdleAllocated?: () => number
    /** RSS of those idle processes; excluded in worker thread mode. */
    getIdleRss?: () => number
  } & (
    | { mode: 'processes' }
    | {
        mode: 'threads'
        /** Parent isolate's JS heap and external allocations, excluding workers. */
        getParentAllocated: () => number
      }
  )
  callStep: (
    slot: number,
    input: AdaptiveStepInput
  ) => Promise<AdaptiveStepResult>
  /** Times a page may be retried after crashing a worker. */
  maxCrashRetries?: number
  /** See "heavy-route limit" in `route-queue.ts`. */
  heavyRouteLimit?: boolean
  log?: (message: string) => void
  /** Clock for how long memory stays high; defaults to `Date.now`. */
  now?: () => number
}

/** Share of the machine memory the workers may use together. */
const MACHINE_BUDGET_SHARE = 0.85
const MACHINE_HIGH_WATER = 0.9
const MACHINE_LOW_WATER = 0.8
/** Share of the machine memory that worker RSS may reach in total. */
const MACHINE_RAW_SHARE = 0.95
const MAX_CONSECUTIVE_STEP_ERRORS = 5
/** Warn about RSS near the machine limit once it stays there this long. */
const RSS_WARNING_AFTER_MS = 5000
const MEMORY_HINT =
  'To avoid this, lower `experimental.staticGenerationMaxConcurrency` or `experimental.cpus`, or give the build more memory.'

function formatMemory(bytes: number): string {
  const mb = Math.max(0, bytes) / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

export class StaticGenerationCrashError extends Error {
  code = 'NEXT_STATIC_GENERATION_WORKER_CRASH'
}

function isWorkerRestartError(err: unknown): boolean {
  // jest-worker rejects the in-flight call with `type: 'WorkerError'` when the
  // worker exits (we run it with `maxRetries: 0`).
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: unknown }).type === 'WorkerError'
  )
}

export function runAdaptiveStaticGeneration(
  options: AdaptiveOrchestratorOptions
): Promise<ExportPagesResult> {
  const {
    exportPaths,
    phase,
    sessionId,
    session,
    renderResumeDataCachesByPage,
    getPageKey,
    chunkSize,
    maxConcurrency,
    machineMemoryLimit,
    memory,
    callStep,
    maxCrashRetries = 2,
    heavyRouteLimit = false,
    log = () => {},
    now = Date.now,
  } = options

  const results: Array<ExportPagesResult[number] | undefined> = new Array(
    exportPaths.length
  )
  let remaining = exportPaths.length
  const allTasks: Task[] = exportPaths.map((exportPath, id) => ({
    id,
    route: exportPath.page,
    exportPath,
    crashes: 0,
    isolate: false,
    placement: 'queue',
    fromRouteQueue: false,
  }))
  const tasks = new Map<number, Task>(allTasks.map((task) => [task.id, task]))
  const routeQueue = new RouteQueue<Task>(allTasks, { heavyRouteLimit })
  /** Pages retried after a crash; each runs alone. */
  const retryQueue: Task[] = []
  const pendingCount = () => routeQueue.size + retryQueue.length
  /** Accepted, unfinished pages by worker id. */
  const outstanding = new Map<string, Set<number>>()

  const numSlots = Math.max(1, options.numSlots)
  const slots: Slot[] = Array.from({ length: numSlots }, (_, index) => ({
    index,
    busy: false,
    cancelled: false,
    sessionReady: false,
    workerId: undefined,
    status: undefined,
    consecutiveErrors: 0,
  }))

  /** Allocated worker memory is over the machine budget (with hysteresis). */
  let machineSaturated = false
  /** Each memory warning is logged at most once per run (phase). */
  let warnedBudget = false
  let warnedRss = false
  let rssHighSince: number | undefined

  return new Promise<ExportPagesResult>((resolve, reject) => {
    let settled = false
    let failed = false

    /**
     * After the build failed, tell a worker to drop the pages it accepted but
     * hasn't started, so it stops rendering and writing them. A slot with a
     * step in flight is cancelled once that step returns, since a worker
     * runs one call at a time; steps return within `MAX_STEP_WAIT_MS`.
     */
    const cancelSlot = (slot: Slot) => {
      if (slot.cancelled || slot.busy || !slot.workerId) return
      slot.cancelled = true
      callStep(slot.index, {
        sessionId,
        slot: slot.index,
        phase,
        submit: [],
        wait: 'drained',
        limits: { maxConcurrency, rssLimit: undefined },
        cancel: true,
      }).catch(() => {
        // The worker is gone or the pool was ended; nothing left to stop.
      })
    }

    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      failed = true
      reject(err)
      for (const slot of slots) cancelSlot(slot)
    }

    if (remaining === 0) {
      settled = true
      resolve([])
      return
    }

    const outstandingFor = (workerId: string | undefined) =>
      workerId ? (outstanding.get(workerId)?.size ?? 0) : 0

    const totalWorkerRss = () =>
      slots.reduce((sum, slot) => sum + (slot.status?.rss ?? 0), 0)
    const totalWorkerRawRss = () =>
      slots.reduce((sum, slot) => sum + (slot.status?.rawRss ?? 0), 0)
    const idleAllocated = () => memory.getIdleAllocated?.() ?? 0
    const idleRss = () => memory.getIdleRss?.() ?? 0

    // Thread heaps are already included in process RSS. Use the parent
    // isolate's allocations for the live budget; shared process RSS still
    // guards native allocations and other threads at the machine limit.
    const getParentUsage = () =>
      memory.mode === 'threads' ? memory.getParentAllocated() : memory.getRss()

    const workerBudget = () => {
      const budget =
        machineMemoryLimit * MACHINE_BUDGET_SHARE -
        getParentUsage() -
        idleAllocated()
      return Math.max(0, budget) / slots.length
    }

    /** Puts a handed-out page back: into its route, or to the retry queue. */
    const requeue = (task: Task, placement: string) => {
      task.placement = placement
      if (task.isolate) {
        if (task.fromRouteQueue) routeQueue.forget(task)
        task.fromRouteQueue = false
        // Retried pages go first so they don't become the tail.
        retryQueue.unshift(task)
      } else if (task.fromRouteQueue) {
        task.fromRouteQueue = false
        routeQueue.giveBack([task])
      } else {
        retryQueue.unshift(task)
      }
    }

    const loseWorker = (workerId: string, reason: string) => {
      const lost = outstanding.get(workerId)
      outstanding.delete(workerId)
      if (!lost || lost.size === 0) return
      const pages: string[] = []
      for (const id of lost) {
        const task = tasks.get(id)!
        task.crashes++
        task.isolate = true
        pages.push(task.exportPath.path)
        if (task.crashes > maxCrashRetries) {
          fail(
            new StaticGenerationCrashError(
              `Static generation failed: rendering "${task.exportPath.path}" crashed the build worker ${task.crashes} times.`
            )
          )
          return
        }
        requeue(task, `retry-after-${reason}`)
      }
      log(
        `Retrying ${pages.length} page(s) from a ${reason} build worker one at a time: ${pages.slice(0, 5).join(', ')}${pages.length > 5 ? ', ...' : ''}`
      )
    }

    const takeChunk = (slot: Slot): Task[] => {
      // A page retried after a crash runs alone.
      if (retryQueue.length > 0) {
        return outstandingFor(slot.workerId) === 0 ? [retryQueue.shift()!] : []
      }
      if (routeQueue.size === 0) return []
      // Over the machine's memory budget, an idle worker gets one page so the
      // build keeps making progress without adding much memory.
      const capacity = machineSaturated
        ? 1
        : slot.status
          ? slot.status.capacity
          : chunkSize
      const count = Math.max(1, Math.min(chunkSize, capacity))
      const { tasks: chunk, placement } = routeQueue.take(slot.index, count)
      for (const task of chunk) {
        task.fromRouteQueue = true
        // Keep why a page came back, for the profile.
        task.placement = task.placement.startsWith('refused-by-')
          ? `${task.placement};${placement}`
          : placement
      }
      return chunk
    }

    const slotScore = (slot: Slot) => {
      // Prefer the most memory headroom, then the fewest pages in flight.
      const headroom = slot.status ? 1 - slot.status.memoryUsage : 1
      const inFlight = slot.status
        ? slot.status.running + slot.status.queued
        : 0
      return headroom * 1000 - inFlight
    }

    const send = (
      slot: Slot,
      submit: Task[],
      step: Partial<AdaptiveStepInput>
    ) => {
      slot.busy = true
      const input: AdaptiveStepInput = {
        sessionId,
        slot: slot.index,
        phase,
        session: slot.sessionReady ? undefined : session,
        submit: submit.map((task): AdaptiveTaskInput => {
          const pageKey = getPageKey(task.exportPath)
          return {
            id: task.id,
            exportPath: task.exportPath,
            renderResumeDataCache: renderResumeDataCachesByPage?.[pageKey],
            isolate: task.isolate || undefined,
            placement: task.placement,
          }
        }),
        wait: step.wait ?? 'capacity',
        limits: { maxConcurrency, rssLimit: workerBudget() },
      }
      callStep(slot.index, input).then(
        (result) => onResult(slot, submit, result),
        (err) => onError(slot, submit, err)
      )
    }

    const onResult = (
      slot: Slot,
      submitted: Task[],
      result: AdaptiveStepResult
    ) => {
      if (settled) {
        slot.busy = false
        if (failed) {
          slot.workerId = result.workerId
          cancelSlot(slot)
        }
        return
      }
      slot.busy = false
      slot.consecutiveErrors = 0

      if (slot.workerId && result.workerId !== slot.workerId) {
        // The worker behind this slot was replaced since its last step.
        loseWorker(slot.workerId, 'restarted')
      }
      slot.workerId = result.workerId
      slot.status = result.status

      if (result.needsSession) {
        slot.sessionReady = false
        for (let i = submitted.length - 1; i >= 0; i--) {
          requeue(submitted[i], submitted[i].placement)
        }
      } else {
        slot.sessionReady = true
        const refused = new Set(result.refused)
        let workerOutstanding = outstanding.get(result.workerId)
        if (!workerOutstanding) {
          workerOutstanding = new Set()
          outstanding.set(result.workerId, workerOutstanding)
        }
        for (let i = submitted.length - 1; i >= 0; i--) {
          const task = submitted[i]
          if (refused.has(task.id)) {
            requeue(task, `refused-by-${result.workerId}`)
          } else {
            workerOutstanding.add(task.id)
          }
        }
        for (const { id, heapPerPage, ...pageResult } of result.results) {
          for (const set of outstanding.values()) set.delete(id)
          if (results[id] !== undefined) continue
          results[id] = pageResult
          const task = tasks.get(id)
          if (task?.fromRouteQueue) {
            task.fromRouteQueue = false
            routeQueue.complete(task, pageResult.result?.duration, heapPerPage)
          }
          remaining--
        }
      }

      pump()
    }

    const onError = (slot: Slot, submitted: Task[], err: unknown) => {
      if (settled) {
        slot.busy = false
        // A worker that threw has stopped its own session; one that
        // restarted has nothing left to cancel.
        return
      }
      slot.busy = false
      slot.sessionReady = false

      if (!isWorkerRestartError(err)) {
        // An unexpected error from the page export itself fails the build,
        // like it does without the adaptive scheduler.
        fail(err)
        return
      }

      slot.consecutiveErrors++
      if (slot.consecutiveErrors > MAX_CONSECUTIVE_STEP_ERRORS) {
        fail(err)
        return
      }

      // The worker restarted. Whatever it had accepted is gone, and so are
      // the pages in this step, which it may or may not have accepted.
      if (slot.workerId) {
        const lost = outstanding.get(slot.workerId) ?? new Set<number>()
        for (const task of submitted) lost.add(task.id)
        outstanding.set(slot.workerId, lost)
        loseWorker(slot.workerId, 'crashed')
      } else {
        for (const task of submitted) {
          task.crashes++
          task.isolate = true
          if (task.crashes > maxCrashRetries) {
            fail(
              new StaticGenerationCrashError(
                `Static generation failed: rendering "${task.exportPath.path}" crashed the build worker ${task.crashes} times.`
              )
            )
            return
          }
          requeue(task, 'retry-after-crashed')
        }
      }
      slot.workerId = undefined
      slot.status = undefined
      pump()
    }

    /**
     * Says once when the machine's memory starts slowing generation down, so
     * a slow build has a visible reason. The checks run on every step result,
     * so each warning is logged at most once per run.
     */
    const warnAboutMemory = (budget: number, rawUsage: number) => {
      if (machineSaturated && !warnedBudget) {
        warnedBudget = true
        log(
          `Static generation reached its memory limit: build workers are using ${formatMemory(totalWorkerRss() + idleAllocated())} of their ${formatMemory(budget)} budget (${formatMemory(machineMemoryLimit)} available to the build). Each worker now renders one page at a time until memory frees up. ${MEMORY_HINT}`
        )
      }
      if (rawUsage < 1) {
        rssHighSince = undefined
        return
      }
      rssHighSince ??= now()
      // While over the budget above, that warning already explains it.
      if (
        warnedRss ||
        machineSaturated ||
        now() - rssHighSince < RSS_WARNING_AFTER_MS
      ) {
        return
      }
      warnedRss = true
      const [resident, limit] =
        memory.mode === 'threads'
          ? [memory.getRss(), machineMemoryLimit * MACHINE_RAW_SHARE]
          : [
              totalWorkerRawRss() + idleRss(),
              machineMemoryLimit * MACHINE_RAW_SHARE - getParentUsage(),
            ]
      log(
        `Static generation is close to the machine's memory limit: build processes hold ${formatMemory(resident)} of the ${formatMemory(limit)} they may use (${formatMemory(machineMemoryLimit)} available to the build). Workers finish their current pages before taking more, which slows generation down. ${MEMORY_HINT}`
      )
    }

    const pump = () => {
      if (settled) return
      if (remaining === 0) {
        settled = true
        resolve(results as ExportPagesResult)
        return
      }

      // Machine-wide memory budget. Allocated memory drives the hysteresis
      // and limits idle workers to one page while it is over budget.
      const budget =
        machineMemoryLimit * MACHINE_BUDGET_SHARE - getParentUsage()
      const usage = (totalWorkerRss() + idleAllocated()) / Math.max(1, budget)
      if (usage >= MACHINE_HIGH_WATER) machineSaturated = true
      else if (usage <= MACHINE_LOW_WATER) machineSaturated = false
      // RSS rarely shrinks after a burst, and memory a process already holds
      // can be reused, so RSS doesn't latch the allocation hysteresis above.
      // Near the machine limit it only stops workers from prefetching: each
      // drains the pages it has before it gets the next chunk.
      const rawUsage =
        memory.mode === 'threads'
          ? memory.getRss() /
            Math.max(1, machineMemoryLimit * MACHINE_RAW_SHARE)
          : (totalWorkerRawRss() + idleRss()) /
            Math.max(
              1,
              machineMemoryLimit * MACHINE_RAW_SHARE - getParentUsage()
            )
      const holdBackBusy = machineSaturated || rawUsage >= 1
      warnAboutMemory(budget, rawUsage)

      const idle = slots
        .filter((slot) => !slot.busy)
        .sort((a, b) => slotScore(b) - slotScore(a))

      for (const slot of idle) {
        const pending = outstandingFor(slot.workerId)

        // Pages retried after a crash run alone, on a worker with nothing in
        // flight.
        const headIsolated = retryQueue.length > 0
        // Over the machine budget, only idle workers take new pages. A
        // saturated worker, or one with no capacity left, would refuse them
        // right away; wait for it to free up instead.
        const noCapacity =
          slot.status !== undefined && slot.status.capacity <= 0
        const holdBack =
          pending > 0 &&
          (holdBackBusy ||
            slot.status?.saturated === true ||
            headIsolated ||
            noCapacity)
        const chunk = pendingCount() > 0 && !holdBack ? takeChunk(slot) : []

        if (chunk.length > 0) {
          send(slot, chunk, { wait: 'capacity' })
        } else if (pending > 0) {
          // Waiting for capacity only helps if we could then send pages.
          const wait =
            pendingCount() > 0 && !holdBackBusy && !headIsolated
              ? 'capacity'
              : 'drained'
          send(slot, [], { wait })
        }
      }

      if (!slots.some((slot) => slot.busy) && remaining > 0) {
        fail(
          new Error(
            `Invariant: adaptive static generation stalled with ${remaining} page(s) left and ${pendingCount()} queued`
          )
        )
      }
    }

    pump()
  })
}
