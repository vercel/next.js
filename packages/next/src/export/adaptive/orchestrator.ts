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
 * headroom, to keep total worker memory under the machine budget, and to
 * recycle workers whose memory baseline creeps up. Pages lost in a worker
 * crash are retried one at a time.
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
  active: boolean
  busy: boolean
  sessionReady: boolean
  workerId: string | undefined
  status: AdaptiveWorkerStatus | undefined
  consecutiveErrors: number
  recycle: 'none' | 'pending' | 'sent'
  recycles: number
  /** Post-GC floor once the worker warmed up, to detect creep. */
  initialFloor: number | undefined
  pagesDone: number
}

export type AdaptiveOrchestratorOptions = {
  exportPaths: ExportPathEntry[]
  phase: StaticGenerationPhase
  sessionId: string
  session: AdaptiveSessionInput
  renderResumeDataCachesByPage?: Record<string, string>
  getPageKey: (exportPath: ExportPathEntry) => string
  /** Worker slots in the pool. */
  numSlots: number
  /** Slots to use from the start; the rest activate under load. */
  initialSlots: number
  chunkSize: number
  /** User cap for pages in flight per worker, if configured. */
  maxConcurrency: number | undefined
  /** Memory available to the whole build (container limit or total RAM). */
  machineMemoryLimit: number
  /** Memory used by the parent process. */
  getParentRss: () => number
  callStep: (
    slot: number,
    input: AdaptiveStepInput
  ) => Promise<AdaptiveStepResult>
  /** Times a page may be retried after crashing a worker. */
  maxCrashRetries?: number
  /** See "heavy-route limit" in `route-queue.ts`. */
  heavyRouteLimit?: boolean
  log?: (message: string) => void
}

/** Share of the machine memory the workers may use together. */
const MACHINE_BUDGET_SHARE = 0.85
const MACHINE_HIGH_WATER = 0.9
const MACHINE_LOW_WATER = 0.8
/** Share of the machine memory that worker RSS may reach in total. */
const MACHINE_RAW_SHARE = 0.95
/** A worker is considered CPU bound above this event loop utilization. */
const CPU_BOUND_ELU = 0.85
/** Recycle when the post-GC floor grows by this factor... */
const RECYCLE_GROWTH = 1.5
/** ...and by at least this share of the worker's memory limit. */
const RECYCLE_MIN_SHARE = 0.25
const RECYCLE_WARMUP_PAGES = 50
const MAX_RECYCLES_PER_SLOT = 3
const MAX_CONSECUTIVE_STEP_ERRORS = 5

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
    getParentRss,
    callStep,
    maxCrashRetries = 2,
    heavyRouteLimit = false,
    log = () => {},
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
    active: index < Math.max(1, Math.min(numSlots, options.initialSlots)),
    busy: false,
    sessionReady: false,
    workerId: undefined,
    status: undefined,
    consecutiveErrors: 0,
    recycle: 'none',
    recycles: 0,
    initialFloor: undefined,
    pagesDone: 0,
  }))

  let machineSaturated = false

  return new Promise<ExportPagesResult>((resolve, reject) => {
    let settled = false
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      reject(err)
    }

    if (remaining === 0) {
      settled = true
      resolve([])
      return
    }

    const outstandingFor = (workerId: string | undefined) =>
      workerId ? (outstanding.get(workerId)?.size ?? 0) : 0

    const workerBudget = () => {
      const activeSlots = slots.filter((slot) => slot.active).length
      const budget = machineMemoryLimit * MACHINE_BUDGET_SHARE - getParentRss()
      return Math.max(0, budget) / Math.max(1, activeSlots)
    }

    const totalWorkerRss = () =>
      slots.reduce((sum, slot) => sum + (slot.status?.rss ?? 0), 0)
    const totalWorkerRawRss = () =>
      slots.reduce((sum, slot) => sum + (slot.status?.rawRss ?? 0), 0)

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
      const capacity = slot.status ? slot.status.capacity : chunkSize
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

    const maybeActivateSlot = () => {
      const inactive = slots.find((slot) => !slot.active)
      if (!inactive || pendingCount() <= chunkSize) return
      const active = slots.filter((slot) => slot.active)
      const allCpuBound = active.every(
        (slot) => slot.status && slot.status.elu >= CPU_BOUND_ELU
      )
      if (!allCpuBound) return
      const avgRss = totalWorkerRss() / Math.max(1, active.length)
      const budget = machineMemoryLimit * MACHINE_BUDGET_SHARE - getParentRss()
      if (totalWorkerRss() + avgRss < budget * MACHINE_LOW_WATER) {
        inactive.active = true
        log(
          `Activating static worker slot ${inactive.index}: all workers are CPU bound and memory allows`
        )
      }
    }

    const maybeScheduleRecycle = (slot: Slot) => {
      const status = slot.status
      if (
        !status ||
        status.postGcFloor === undefined ||
        slot.recycle !== 'none' ||
        slot.recycles >= MAX_RECYCLES_PER_SLOT
      ) {
        return
      }
      if (slot.initialFloor === undefined) {
        if (slot.pagesDone >= RECYCLE_WARMUP_PAGES) {
          slot.initialFloor = status.postGcFloor
        }
        return
      }
      const limit = Math.min(status.heapLimit, workerBudget() || Infinity)
      const growth = status.postGcFloor - slot.initialFloor
      if (
        status.postGcFloor > slot.initialFloor * RECYCLE_GROWTH &&
        growth > limit * RECYCLE_MIN_SHARE
      ) {
        slot.recycle = 'pending'
        log(
          `Recycling static worker ${status.workerId}: post-GC heap grew from ${Math.round(slot.initialFloor / 1048576)}MB to ${Math.round(status.postGcFloor / 1048576)}MB`
        )
      }
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
        limits: { maxConcurrency, rssLimit: workerBudget() || undefined },
        recycleWorkerId: step.recycleWorkerId,
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
      if (settled) return
      slot.busy = false
      slot.consecutiveErrors = 0

      if (slot.workerId && result.workerId !== slot.workerId) {
        // The worker behind this slot was replaced since its last step.
        loseWorker(slot.workerId, 'restarted')
        slot.initialFloor = undefined
        slot.pagesDone = 0
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
          if (results[id] !== undefined) continue
          results[id] = pageResult
          const task = tasks.get(id)
          if (task?.fromRouteQueue) {
            task.fromRouteQueue = false
            routeQueue.complete(task, pageResult.result?.duration, heapPerPage)
          }
          remaining--
          slot.pagesDone++
          for (const set of outstanding.values()) set.delete(id)
        }
      }

      if (slot.recycle === 'sent') {
        // The recycle request reached a worker that had already restarted.
        slot.recycle = 'none'
      }
      maybeScheduleRecycle(slot)
      pump()
    }

    const onError = (slot: Slot, submitted: Task[], err: unknown) => {
      if (settled) return
      slot.busy = false
      slot.sessionReady = false

      if (!isWorkerRestartError(err)) {
        // An unexpected error from the page export itself fails the build,
        // like it does without the adaptive scheduler.
        fail(err)
        return
      }

      if (slot.recycle === 'sent') {
        slot.recycle = 'none'
        slot.recycles++
      } else {
        slot.consecutiveErrors++
        if (slot.consecutiveErrors > MAX_CONSECUTIVE_STEP_ERRORS) {
          fail(err)
          return
        }
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
      slot.initialFloor = undefined
      slot.pagesDone = 0
      pump()
    }

    const pump = () => {
      if (settled) return
      if (remaining === 0) {
        settled = true
        resolve(results as ExportPagesResult)
        return
      }

      // Machine-wide memory budget, with hysteresis.
      const budget = machineMemoryLimit * MACHINE_BUDGET_SHARE - getParentRss()
      // Allocated memory drives the hysteresis. RSS rarely shrinks after a
      // burst, so it only holds dispatch back once it nears the machine
      // limit itself.
      const usage = totalWorkerRss() / Math.max(1, budget)
      const rawUsage =
        totalWorkerRawRss() /
        Math.max(1, machineMemoryLimit * MACHINE_RAW_SHARE - getParentRss())
      if (usage >= MACHINE_HIGH_WATER || rawUsage >= 1) machineSaturated = true
      else if (usage <= MACHINE_LOW_WATER) machineSaturated = false

      maybeActivateSlot()

      const idle = slots
        .filter((slot) => slot.active && !slot.busy)
        .sort((a, b) => slotScore(b) - slotScore(a))

      for (const slot of idle) {
        const pending = outstandingFor(slot.workerId)

        if (slot.recycle === 'pending' && slot.workerId) {
          if (pending === 0) {
            slot.recycle = 'sent'
            send(slot, [], { wait: 'drained', recycleWorkerId: slot.workerId })
          } else {
            send(slot, [], { wait: 'drained' })
          }
          continue
        }

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
          (machineSaturated ||
            slot.status?.saturated === true ||
            headIsolated ||
            noCapacity)
        const chunk = pendingCount() > 0 && !holdBack ? takeChunk(slot) : []

        if (chunk.length > 0) {
          send(slot, chunk, { wait: 'capacity' })
        } else if (pending > 0) {
          // Waiting for capacity only helps if we could then send pages.
          const wait =
            pendingCount() > 0 && !machineSaturated && !headIsolated
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
