/**
 * Opt-in profiling for static generation in `next build`.
 *
 * Enable with `NEXT_STATIC_GENERATION_PROFILE=1`. Every export worker then
 * records one entry per page (which worker rendered it, when it started and
 * finished, which phase it belonged to) and samples its own event loop
 * utilization and memory. Records are appended to
 * `<distDir>/diagnostics/static-generation/worker-*.jsonl`, and the parent
 * process writes a summary to
 * `<distDir>/diagnostics/static-generation-summary.json` once static
 * generation finishes.
 *
 * The summary answers three questions about a build:
 *  - How much of the static generation window each worker spent idle.
 *  - How long the tail was (spread between the first and last worker to
 *    finish).
 *  - How much memory each worker used at peak.
 *
 * Profiling never changes what is rendered. It only observes.
 */
import fs from 'fs'
import path from 'path'
import { performance, PerformanceObserver } from 'perf_hooks'
import v8 from 'v8'
import { threadId } from 'worker_threads'
import type { ExportPageResult } from './types'
import type { IncrementalCache } from '../server/lib/incremental-cache'

export const STATIC_GENERATION_PROFILE_ENV = 'NEXT_STATIC_GENERATION_PROFILE'

export type StaticGenerationPhase = 'initial' | 'final'

export function isStaticGenerationProfileEnabled(): boolean {
  const value = process.env[STATIC_GENERATION_PROFILE_ENV]
  return value === '1' || value === 'true'
}

export function getStaticGenerationProfileDir(distDir: string): string {
  return path.join(distDir, 'diagnostics', 'static-generation')
}

export function getStaticGenerationSummaryPath(distDir: string): string {
  return path.join(distDir, 'diagnostics', 'static-generation-summary.json')
}

/**
 * An identifier for the current export worker: the process id, plus the
 * thread id when running in worker thread mode. A worker that is restarted
 * gets a new identifier.
 */
export function getStaticWorkerId(): string {
  return `pid-${process.pid}${threadId ? `.${threadId}` : ''}`
}

export type PageRecord = {
  type: 'page'
  workerId: string
  phase: StaticGenerationPhase
  page: string
  path: string
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds. */
  end: number
  ok: boolean
  /** Number of pages in flight in this worker when this page started. */
  inFlightAtStart: number
  /** Free-form reason for why the page was placed on this worker. */
  placement?: string
}

export type SampleRecord = {
  type: 'sample'
  workerId: string
  /** Epoch milliseconds at the end of the sample interval. */
  t: number
  /** Event loop active time during the interval, in milliseconds. */
  activeMs: number
  /** Event loop idle time during the interval, in milliseconds. */
  idleMs: number
  rss: number
  heapUsed: number
  inFlight: number
}

export type GcRecord = {
  type: 'gc'
  workerId: string
  t: number
  /** Heap in use right after a major GC. */
  postGcHeap: number
}

export type WorkerInfoRecord = {
  type: 'worker'
  workerId: string
  pid: number
  threadId: number
  heapSizeLimit: number
  constrainedMemory: number | null
}

export type CallRecord = {
  type: 'call'
  workerId: string
  phase: StaticGenerationPhase
  start: number
  end: number
  pages: number
  /** Fetch cache lookups that hit during this call. */
  fetchHits: number
  /** Fetch cache lookups that missed during this call. */
  fetchMisses: number
}

export type ProfileRecord =
  | PageRecord
  | SampleRecord
  | GcRecord
  | WorkerInfoRecord
  | CallRecord

const SAMPLE_INTERVAL_MS = 100

/**
 * Returns the container or process memory limit, if there is one. Node returns
 * `0` or `undefined` when no limit applies, and a very large number on some
 * cgroup v1 hosts.
 */
export function getConstrainedMemory(): number | null {
  const constrainedMemory = (process as any).constrainedMemory as
    | (() => number | undefined)
    | undefined
  if (typeof constrainedMemory !== 'function') return null
  const value = constrainedMemory.call(process)
  if (!value || !Number.isFinite(value) || value >= Number.MAX_SAFE_INTEGER) {
    return null
  }
  return value
}

/**
 * Worker-side recorder. One per worker process (or thread).
 */
class StaticGenerationProfiler {
  private readonly workerId = getStaticWorkerId()
  private records: ProfileRecord[] = []
  private file: string | undefined
  private started = false
  private inFlight = 0
  private fetchHits = 0
  private fetchMisses = 0
  private instrumentedCaches = new WeakSet<object>()
  private lastElu = performance.eventLoopUtilization()

  get pagesInFlight(): number {
    return this.inFlight
  }

  private start(distDir: string) {
    if (this.started) return
    this.started = true

    const dir = getStaticGenerationProfileDir(distDir)
    fs.mkdirSync(dir, { recursive: true })
    this.file = path.join(
      dir,
      `worker-${process.pid}${threadId ? `-${threadId}` : ''}.jsonl`
    )

    this.records.push({
      type: 'worker',
      workerId: this.workerId,
      pid: process.pid,
      threadId,
      heapSizeLimit: v8.getHeapStatistics().heap_size_limit,
      constrainedMemory: getConstrainedMemory(),
    })

    this.lastElu = performance.eventLoopUtilization()
    const interval = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS)
    interval.unref()

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // NODE_PERFORMANCE_GC_MAJOR = 4, NODE_PERFORMANCE_GC_INCREMENTAL = 8
          const kind = (entry as any).detail?.kind ?? (entry as any).kind
          if (kind === 4 || kind === 8) {
            this.records.push({
              type: 'gc',
              workerId: this.workerId,
              t: Date.now(),
              postGcHeap: v8.getHeapStatistics().used_heap_size,
            })
          }
        }
      })
      observer.observe({ entryTypes: ['gc'] })
    } catch {
      // GC observation is best effort.
    }
  }

  private sample() {
    const elu = performance.eventLoopUtilization(this.lastElu)
    this.lastElu = performance.eventLoopUtilization()
    this.records.push({
      type: 'sample',
      workerId: this.workerId,
      t: Date.now(),
      activeMs: elu.active,
      idleMs: elu.idle,
      // `process.memoryUsage()` walks every heap page, which gets expensive
      // with a large heap at 10 samples a second. These two calls are cheap.
      rss: process.memoryUsage.rss(),
      heapUsed: v8.getHeapStatistics().used_heap_size,
      inFlight: this.inFlight,
    })
  }

  /**
   * Counts fetch cache hits and misses seen by `incrementalCache`. Results
   * are attributed to the call that is running when the lookup resolves.
   */
  instrumentIncrementalCache(incrementalCache: IncrementalCache) {
    if (this.instrumentedCaches.has(incrementalCache)) return
    this.instrumentedCaches.add(incrementalCache)
    const get = incrementalCache.get.bind(incrementalCache)
    incrementalCache.get = (async (cacheKey: string, ctx: any) => {
      const entry = await get(cacheKey, ctx)
      if (ctx?.kind === 'FETCH') {
        if (entry?.value && !entry.isStale) this.fetchHits++
        else this.fetchMisses++
      }
      return entry
    }) as typeof incrementalCache.get
  }

  beginCall(distDir: string): {
    end: (phase: StaticGenerationPhase, pages: number) => void
  } {
    this.start(distDir)
    const start = Date.now()
    const hitsAtStart = this.fetchHits
    const missesAtStart = this.fetchMisses
    return {
      end: (phase, pages) => {
        // Close the sampling interval now: a call that finishes before the
        // next tick would otherwise lose its last stretch of CPU and memory
        // data (and a short call would have none at all).
        this.sample()
        this.records.push({
          type: 'call',
          workerId: this.workerId,
          phase,
          start,
          end: Date.now(),
          pages,
          fetchHits: this.fetchHits - hitsAtStart,
          fetchMisses: this.fetchMisses - missesAtStart,
        })
        this.flush()
      },
    }
  }

  beginPage(): { start: number; inFlightAtStart: number } {
    const inFlightAtStart = this.inFlight
    this.inFlight++
    return { start: Date.now(), inFlightAtStart }
  }

  endPage(
    started: { start: number; inFlightAtStart: number },
    info: {
      phase: StaticGenerationPhase
      page: string
      path: string
      result: ExportPageResult | undefined
      placement?: string
    }
  ) {
    this.inFlight--
    const result = info.result
    this.records.push({
      type: 'page',
      workerId: this.workerId,
      phase: info.phase,
      page: info.page,
      path: info.path,
      start: started.start,
      end: Date.now(),
      ok: Boolean(result && !('error' in result)),
      inFlightAtStart: started.inFlightAtStart,
      placement: info.placement,
    })
  }

  flush() {
    if (!this.file || this.records.length === 0) return
    const records = this.records
    this.records = []
    try {
      fs.appendFileSync(
        this.file,
        records.map((record) => JSON.stringify(record)).join('\n') + '\n'
      )
    } catch {
      // Profiling must never fail the build.
    }
  }
}

let profiler: StaticGenerationProfiler | undefined

/**
 * Returns the worker-side profiler, or `undefined` when profiling is off.
 */
export function getStaticGenerationProfiler():
  | StaticGenerationProfiler
  | undefined {
  if (!isStaticGenerationProfileEnabled()) return undefined
  profiler ??= new StaticGenerationProfiler()
  return profiler
}

// ---------------------------------------------------------------------------
// Summary (parent process and bench scripts)
// ---------------------------------------------------------------------------

export type WorkerSummary = {
  workerId: string
  pages: number
  firstStart: number
  lastEnd: number
  /** ms from the window start until this worker finished its last page. */
  finishOffsetMs: number
  /** % of the window the event loop was busy running JavaScript. */
  cpuActivePct: number
  /** % of the window the worker had no page in flight. */
  noWorkPct: number
  /** % of the window the worker had pages in flight but was waiting on I/O. */
  ioWaitPct: number
  /** 100 - cpuActivePct. */
  idlePct: number
  peakRss: number
  peakHeapUsed: number
  peakPostGcHeap: number
  heapSizeLimit: number | null
  maxInFlight: number
}

export type PhaseSummary = {
  phase: StaticGenerationPhase
  pages: number
  windowMs: number
  /** Spread between the first and the last worker to finish, in ms. */
  tailSpreadMs: number
}

export type StaticGenerationSummary = {
  pages: number
  failedPages: number
  workers: number
  windowMs: number
  /** Spread between the first and the last worker to finish, in ms. */
  tailSpreadMs: number
  /** tailSpreadMs as a percentage of windowMs. */
  tailSpreadPct: number
  meanIdlePct: number
  meanNoWorkPct: number
  peakRss: number
  peakPostGcHeap: number
  fetchHits: number
  fetchMisses: number
  /** hits / (hits + misses), or null when no cacheable fetches happened. */
  fetchHitRate: number | null
  phases: PhaseSummary[]
  perWorker: WorkerSummary[]
}

export function readProfileRecords(dir: string): ProfileRecord[] {
  const records: ProfileRecord[] = []
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((file) => file.endsWith('.jsonl'))
  } catch {
    return records
  }
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const line of content.split('\n')) {
      if (!line) continue
      try {
        records.push(JSON.parse(line))
      } catch {
        // Ignore torn lines (e.g. a crashed worker).
      }
    }
  }
  return records
}

/**
 * Length of the union of `intervals`, clipped to [from, to].
 */
function unionLength(
  intervals: Array<[number, number]>,
  from: number,
  to: number
): number {
  const sorted = intervals
    .map(([s, e]): [number, number] => [Math.max(s, from), Math.min(e, to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let curStart = -Infinity
  let curEnd = -Infinity
  for (const [s, e] of sorted) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart
      curStart = s
      curEnd = e
    } else if (e > curEnd) {
      curEnd = e
    }
  }
  if (curEnd > curStart) total += curEnd - curStart
  return total
}

// Spreading large arrays into `Math.min`/`Math.max` can throw a RangeError
// (too many arguments), so reduce instead.
function minOf(values: readonly number[], fallback: number): number {
  let result = Infinity
  for (const value of values) if (value < result) result = value
  return result === Infinity ? fallback : result
}

function maxOf(values: readonly number[], fallback: number): number {
  let result = -Infinity
  for (const value of values) if (value > result) result = value
  return result === -Infinity ? fallback : result
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function tailSpread(pages: PageRecord[]): number {
  const lastEndByWorker = new Map<string, number>()
  for (const page of pages) {
    lastEndByWorker.set(
      page.workerId,
      Math.max(lastEndByWorker.get(page.workerId) ?? 0, page.end)
    )
  }
  const ends = [...lastEndByWorker.values()]
  return ends.length > 1 ? maxOf(ends, 0) - minOf(ends, 0) : 0
}

export function summarizeStaticGenerationProfile(
  records: ProfileRecord[]
): StaticGenerationSummary | null {
  const pages = records.filter((r): r is PageRecord => r.type === 'page')
  if (pages.length === 0) return null

  const windowStart = minOf(
    pages.map((p) => p.start),
    0
  )
  const windowEnd = maxOf(
    pages.map((p) => p.end),
    0
  )
  const windowMs = Math.max(1, windowEnd - windowStart)

  const workerIds = [...new Set(pages.map((p) => p.workerId))].sort()
  const perWorker: WorkerSummary[] = []

  for (const workerId of workerIds) {
    const workerPages = pages.filter((p) => p.workerId === workerId)
    const samples = records.filter(
      (r): r is SampleRecord => r.type === 'sample' && r.workerId === workerId
    )
    const gcs = records.filter(
      (r): r is GcRecord => r.type === 'gc' && r.workerId === workerId
    )
    const info = records.find(
      (r): r is WorkerInfoRecord =>
        r.type === 'worker' && r.workerId === workerId
    )

    // Event loop active time inside the window. Samples cover the interval
    // that ends at `t`; prorate the samples that straddle the window edges.
    let activeMs = 0
    for (const sample of samples) {
      const intervalMs = sample.activeMs + sample.idleMs
      if (intervalMs <= 0) continue
      const sampleStart = sample.t - intervalMs
      const overlap =
        Math.min(sample.t, windowEnd) - Math.max(sampleStart, windowStart)
      if (overlap <= 0) continue
      activeMs += sample.activeMs * (overlap / intervalMs)
    }
    const busyMs = unionLength(
      workerPages.map((p): [number, number] => [p.start, p.end]),
      windowStart,
      windowEnd
    )
    const cpuActivePct = Math.min(100, (activeMs / windowMs) * 100)
    const noWorkPct = Math.max(0, 100 - (busyMs / windowMs) * 100)
    const lastEnd = maxOf(
      workerPages.map((p) => p.end),
      0
    )

    perWorker.push({
      workerId,
      pages: workerPages.length,
      firstStart: minOf(
        workerPages.map((p) => p.start),
        0
      ),
      lastEnd,
      finishOffsetMs: lastEnd - windowStart,
      cpuActivePct: round(cpuActivePct),
      noWorkPct: round(noWorkPct),
      ioWaitPct: round(Math.max(0, 100 - cpuActivePct - noWorkPct)),
      idlePct: round(100 - cpuActivePct),
      peakRss: maxOf(
        samples.map((s) => s.rss),
        0
      ),
      peakHeapUsed: maxOf(
        samples.map((s) => s.heapUsed),
        0
      ),
      peakPostGcHeap: maxOf(
        gcs.map((g) => g.postGcHeap),
        0
      ),
      heapSizeLimit: info?.heapSizeLimit ?? null,
      maxInFlight: maxOf(
        workerPages.map((p) => p.inFlightAtStart + 1),
        0
      ),
    })
  }

  const phases: PhaseSummary[] = []
  for (const phase of ['initial', 'final'] as const) {
    const phasePages = pages.filter((p) => p.phase === phase)
    if (phasePages.length === 0) continue
    phases.push({
      phase,
      pages: phasePages.length,
      windowMs:
        maxOf(
          phasePages.map((p) => p.end),
          0
        ) -
        minOf(
          phasePages.map((p) => p.start),
          0
        ),
      tailSpreadMs: tailSpread(phasePages),
    })
  }

  const calls = records.filter((r): r is CallRecord => r.type === 'call')
  const fetchHits = calls.reduce((sum, c) => sum + (c.fetchHits ?? 0), 0)
  const fetchMisses = calls.reduce((sum, c) => sum + (c.fetchMisses ?? 0), 0)
  const spread = tailSpread(pages)
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

  return {
    pages: pages.length,
    failedPages: pages.filter((p) => !p.ok).length,
    workers: workerIds.length,
    windowMs,
    tailSpreadMs: spread,
    tailSpreadPct: round((spread / windowMs) * 100),
    meanIdlePct: round(mean(perWorker.map((w) => w.idlePct))),
    meanNoWorkPct: round(mean(perWorker.map((w) => w.noWorkPct))),
    peakRss: maxOf(
      perWorker.map((w) => w.peakRss),
      0
    ),
    peakPostGcHeap: maxOf(
      perWorker.map((w) => w.peakPostGcHeap),
      0
    ),
    fetchHits,
    fetchMisses,
    fetchHitRate:
      fetchHits + fetchMisses > 0
        ? round(fetchHits / (fetchHits + fetchMisses), 3)
        : null,
    phases,
    perWorker,
  }
}

const MB = 1024 * 1024

export function formatStaticGenerationSummary(
  summary: StaticGenerationSummary
): string {
  const lines = [
    `Static generation profile: ${summary.pages} pages on ${summary.workers} worker(s) in ${summary.windowMs}ms, ` +
      `tail spread ${summary.tailSpreadMs}ms (${summary.tailSpreadPct}%), mean idle ${summary.meanIdlePct}%, ` +
      `peak RSS ${Math.round(summary.peakRss / MB)}MB` +
      (summary.fetchHitRate !== null
        ? `, fetch cache hit rate ${Math.round(summary.fetchHitRate * 100)}%`
        : ''),
  ]
  for (const worker of summary.perWorker) {
    lines.push(
      `  ${worker.workerId}: ${worker.pages} pages, finished at +${worker.finishOffsetMs}ms, ` +
        `cpu ${worker.cpuActivePct}% / io-wait ${worker.ioWaitPct}% / no-work ${worker.noWorkPct}%, ` +
        `peak RSS ${Math.round(worker.peakRss / MB)}MB, peak post-GC heap ${Math.round(worker.peakPostGcHeap / MB)}MB, ` +
        `max in flight ${worker.maxInFlight}`
    )
  }
  return lines.join('\n')
}

/**
 * Parent side: reads the worker records for this build, writes the summary
 * file, and returns it.
 */
export function writeStaticGenerationSummary(
  distDir: string
): StaticGenerationSummary | null {
  const summary = summarizeStaticGenerationProfile(
    readProfileRecords(getStaticGenerationProfileDir(distDir))
  )
  if (!summary) return null
  fs.writeFileSync(
    getStaticGenerationSummaryPath(distDir),
    JSON.stringify(summary, null, 2)
  )
  return summary
}

export function resetStaticGenerationProfile(distDir: string): void {
  fs.rmSync(getStaticGenerationProfileDir(distDir), {
    recursive: true,
    force: true,
  })
  fs.rmSync(getStaticGenerationSummaryPath(distDir), { force: true })
}
