/**
 * Decides how many pages a static generation worker renders at once.
 *
 * The controller raises concurrency while the worker's event loop has idle
 * time (pages are waiting on I/O, so more pages fit) and there is memory
 * headroom for more pages, and lowers it when the worker becomes CPU bound or
 * gets close to its memory limit.
 *
 * Memory uses hysteresis: once usage crosses `highWater` the worker stops
 * taking new pages, and only takes new pages again after usage drops below
 * `lowWater`. Above `criticalWater` it also shrinks its window so in-flight
 * pages can finish and free memory.
 *
 * This class is pure: it has no timers and reads no globals, so it can be
 * unit tested with synthetic samples.
 */

export type AdmissionConfig = {
  /** Smallest window when the worker is not under memory pressure. */
  minConcurrency: number
  initialConcurrency: number
  maxConcurrency: number
  /** Raise the window while event loop utilization is below this. */
  eluTarget: number
  /** Stop taking new pages above this share of the memory limit. */
  highWater: number
  /** Take new pages again below this share of the memory limit. */
  lowWater: number
  /** Shrink the window above this share of the memory limit. */
  criticalWater: number
  /**
   * Only grow if the headroom covers the estimated memory of the new pages
   * times this factor.
   */
  safetyMargin: number
  /** Minimum time between window changes. */
  adjustIntervalMs: number
}

export const DEFAULT_ADAPTIVE_MAX_CONCURRENCY = 64

export function createAdmissionConfig(options: {
  maxConcurrency?: number
}): AdmissionConfig {
  const maxConcurrency = Math.max(
    1,
    options.maxConcurrency ?? DEFAULT_ADAPTIVE_MAX_CONCURRENCY
  )
  return {
    // When CPU bound, give back windows grown for I/O, but never go below the
    // fixed window the non-adaptive path uses. A smaller window measured
    // ~2x slower on a large docs app whose pages look CPU bound by event
    // loop utilization yet still overlap short waits.
    minConcurrency: Math.min(8, maxConcurrency),
    initialConcurrency: Math.min(8, maxConcurrency),
    maxConcurrency,
    eluTarget: 0.8,
    highWater: 0.75,
    lowWater: 0.65,
    criticalWater: 0.9,
    safetyMargin: 1.5,
    adjustIntervalMs: 200,
  }
}

export type AdmissionSample = {
  now: number
  /** Event loop utilization over the last interval, 0..1. */
  elu: number
  heapUsed: number
  /** Heap in use after the most recent major GC, if one has happened. */
  postGcHeap: number | undefined
  /** Allocated memory: JS heap plus external (buffer) memory. */
  rss: number
  /**
   * Resident set size. It rarely shrinks after a burst, so it doesn't drive
   * admission, but the window doesn't grow while it is above `criticalWater`
   * of `rssLimit`: running as many pages as before reuses memory the process
   * already holds, while running more would grow it.
   */
  rawRss?: number
  /** Pages currently rendering. */
  running: number
  /** V8 heap limit. */
  heapLimit: number
  /** RSS budget for this worker, if one applies. */
  rssLimit: number | undefined
}

export type AdmissionState = {
  limit: number
  saturated: boolean
  /** Memory usage as a share of the tightest limit, 0..1+. */
  memoryUsage: number
  /** Estimated heap per in-flight page, in bytes. */
  memoryPerPage: number | undefined
  /** Estimated heap with no pages in flight, in bytes. */
  baselineHeap: number | undefined
  elu: number
}

const EWMA_ALPHA = 0.2

function ewma(previous: number | undefined, value: number): number {
  return previous === undefined
    ? value
    : previous + EWMA_ALPHA * (value - previous)
}

export class AdmissionController {
  private limit: number
  /** Largest window used so far. */
  private maxLimitUsed: number
  private saturated = false
  private memoryUsage = 0
  private memoryPerPage: number | undefined
  private baselineHeap: number | undefined
  private lastAdjust = -Infinity
  private lastElu = 0
  private lastPostGcHeap: number | undefined

  constructor(private readonly config: AdmissionConfig) {
    this.limit = config.initialConcurrency
    this.maxLimitUsed = this.limit
  }

  get state(): AdmissionState {
    return {
      limit: this.limit,
      saturated: this.saturated,
      memoryUsage: this.memoryUsage,
      memoryPerPage: this.memoryPerPage,
      baselineHeap: this.baselineHeap,
      elu: this.lastElu,
    }
  }

  /** Current window: how many pages may render at once. */
  get concurrency(): number {
    return this.limit
  }

  update(sample: AdmissionSample): void {
    const { config } = this
    this.lastElu = sample.elu

    const heapUsage = sample.heapUsed / sample.heapLimit
    const rssUsage = sample.rssLimit ? sample.rss / sample.rssLimit : 0
    const usage = Math.max(heapUsage, rssUsage)
    this.memoryUsage = usage

    // Learn the baseline from GCs that happen while (almost) nothing is in
    // flight, and the per-page cost from the heap above that baseline.
    if (
      sample.postGcHeap !== undefined &&
      sample.postGcHeap !== this.lastPostGcHeap
    ) {
      this.lastPostGcHeap = sample.postGcHeap
      if (this.baselineHeap === undefined) {
        this.baselineHeap = sample.postGcHeap
      } else if (sample.running <= 1) {
        // A GC with nothing in flight measures the baseline directly.
        this.baselineHeap = ewma(this.baselineHeap, sample.postGcHeap)
      } else {
        // With pages in flight, a post-GC heap is an upper bound.
        this.baselineHeap = Math.min(this.baselineHeap, sample.postGcHeap)
      }
    }
    if (sample.running > 0 && this.baselineHeap !== undefined) {
      const perPage =
        Math.max(0, sample.heapUsed - this.baselineHeap) / sample.running
      // Be conservative: take increases right away, decay slowly.
      this.memoryPerPage =
        this.memoryPerPage === undefined || perPage > this.memoryPerPage
          ? perPage
          : ewma(this.memoryPerPage, perPage)
    }

    // Hysteresis on admission.
    if (usage >= config.highWater) {
      this.saturated = true
    } else if (usage <= config.lowWater) {
      this.saturated = false
    }

    if (sample.now - this.lastAdjust < config.adjustIntervalMs) return

    if (usage >= config.criticalWater) {
      // Let in-flight pages drain: halve the window below what's running.
      const next = Math.max(
        1,
        Math.floor(Math.min(this.limit, sample.running) / 2)
      )
      if (next !== this.limit) {
        this.limit = next
        this.lastAdjust = sample.now
      }
      return
    }

    if (this.saturated) {
      // Stop adding, but don't punish pages that are already running.
      const next = Math.max(
        1,
        Math.min(this.limit, Math.max(1, sample.running))
      )
      if (next !== this.limit) {
        this.limit = next
        this.lastAdjust = sample.now
      }
      return
    }

    const rawRssHigh =
      sample.rssLimit !== undefined &&
      sample.rawRss !== undefined &&
      sample.rawRss >= config.criticalWater * sample.rssLimit

    // With RSS near the budget, only grow back to windows we already used:
    // they reuse memory the process holds, while larger ones would grow it.
    const growthCap = rawRssHigh
      ? Math.min(config.maxConcurrency, this.maxLimitUsed)
      : config.maxConcurrency

    const windowFull = sample.running >= this.limit
    if (sample.elu < config.eluTarget && windowFull) {
      const step = Math.max(1, Math.ceil(this.limit * 0.25))
      const headroom = Math.min(
        config.highWater * sample.heapLimit - sample.heapUsed,
        sample.rssLimit
          ? config.highWater * sample.rssLimit - sample.rss
          : Infinity
      )
      const needed = (this.memoryPerPage ?? 0) * config.safetyMargin * step
      // Until we have a per-page estimate, only grow while well below the
      // low-water mark.
      const memoryAllows =
        this.memoryPerPage === undefined
          ? usage < config.lowWater * 0.75
          : headroom > needed
      if (memoryAllows && this.limit < growthCap) {
        this.limit = Math.min(growthCap, this.limit + step)
        this.maxLimitUsed = Math.max(this.maxLimitUsed, this.limit)
        this.lastAdjust = sample.now
      }
      return
    }

    if (sample.elu > Math.min(0.98, config.eluTarget + 0.1)) {
      // CPU bound: windows grown for I/O only add memory and latency now.
      const floor = Math.min(config.minConcurrency, config.maxConcurrency)
      if (this.limit > floor) {
        this.limit = Math.max(floor, this.limit - 1)
        this.lastAdjust = sample.now
      }
    }
  }

  /**
   * How many more pages this worker should accept right now, given what is
   * running and queued locally. `prefetch` pages may wait in the local queue
   * so a slot never idles while the next pages are in transit.
   */
  acceptable(running: number, queued: number, prefetch: number): number {
    const { config } = this
    if (this.memoryUsage >= config.criticalWater || this.saturated) {
      // Always allow one page on an idle worker so the build makes progress.
      return running + queued === 0 ? 1 : 0
    }
    return Math.max(0, this.limit + prefetch - running - queued)
  }
}
