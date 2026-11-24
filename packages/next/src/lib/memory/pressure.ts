import fs from 'fs'
import os from 'os'
import path from 'path'
import createDebug from 'next/dist/compiled/debug'

const debug = createDebug('next:memory-pressure')

/**
 * How much memory the system has left, from least to most urgent:
 * - `none`: nothing to do.
 * - `moderate`: trade some speed for memory where it's cheap, e.g. collect
 *   garbage between batches of work, or don't start new memory-hungry work
 *   until other work has released its memory.
 * - `critical`: also collect garbage right away. Re-sent periodically while
 *   the pressure lasts.
 */
export type MemoryPressureLevel = 'none' | 'moderate' | 'critical'

export interface MemoryPressureNotification {
  type: 'memory-pressure'
  level: MemoryPressureLevel
}

export function isMemoryPressureNotification(
  value: unknown
): value is MemoryPressureNotification {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'memory-pressure'
  )
}

export interface MemorySample {
  /** Fraction of the memory limit (cgroup or physical) still available. */
  availableFraction: number
  /**
   * Linux pressure stall information: the percentage of the last 10 seconds in
   * which some (`some`) or all (`full`) tasks were stalled waiting on memory.
   * `undefined` where PSI isn't available.
   */
  stallSome?: number
  stallFull?: number
}

function readFile(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function readNumber(file: string): number | undefined {
  const value = Number(readFile(file)?.trim())
  return Number.isFinite(value) ? value : undefined
}

function readKey(contents: string | undefined, key: string): number {
  const match = contents?.match(new RegExp(`^${key}:?\\s+(\\d+)`, 'm'))
  return match ? Number(match[1]) : 0
}

/** The cgroup v2 directory this process belongs to, if any. */
function getCgroupV2Dir(): string | undefined {
  const line = readFile('/proc/self/cgroup')
    ?.split('\n')
    .find((l) => l.startsWith('0::'))
  return line ? path.join('/sys/fs/cgroup', line.slice(3)) : undefined
}

/**
 * Memory left under the cgroup limit, when that limit is below physical
 * memory. Usage counts reclaimable page cache, so subtract inactive file
 * pages, the same "working set" container tooling uses. (Node.js'
 * `availableMemory()` doesn't, so it overstates pressure on cache-heavy
 * workloads such as a build writing its output.)
 */
function readCgroupHeadroom(
  cgroupV2Dir: string | undefined,
  totalMemory: number
): { limit: number; available: number } | undefined {
  let limit: number | undefined
  let usage: number | undefined
  let inactiveFile = 0
  if (cgroupV2Dir) {
    limit = readNumber(path.join(cgroupV2Dir, 'memory.max')) // NaN for "max"
    usage = readNumber(path.join(cgroupV2Dir, 'memory.current'))
    inactiveFile = readKey(
      readFile(path.join(cgroupV2Dir, 'memory.stat')),
      'inactive_file'
    )
  } else {
    const dir = '/sys/fs/cgroup/memory'
    limit = readNumber(path.join(dir, 'memory.limit_in_bytes'))
    usage = readNumber(path.join(dir, 'memory.usage_in_bytes'))
    inactiveFile = readKey(
      readFile(path.join(dir, 'memory.stat')),
      'total_inactive_file'
    )
  }
  if (limit === undefined || usage === undefined || limit >= totalMemory) {
    return undefined
  }
  return { limit, available: Math.max(0, limit - (usage - inactiveFile)) }
}

/** Parse `avg10` of the `some` and `full` lines of a PSI file. */
function readPressureStall(
  file: string
): { some: number; full: number } | undefined {
  const contents = readFile(file)
  if (!contents) return undefined
  const avg10 = (kind: string) => {
    const match = contents.match(new RegExp(`^${kind} avg10=([\\d.]+)`, 'm'))
    return match ? Number(match[1]) : 0
  }
  return { some: avg10('some'), full: avg10('full') }
}

/** Sample how much memory is left and, on Linux, how much tasks stall on it. */
export function readMemorySample(): MemorySample {
  const total = os.totalmem()
  if (process.platform !== 'linux') {
    // `availableMemory()` was added in Node.js 20.13.
    const available =
      typeof process.availableMemory === 'function'
        ? process.availableMemory()
        : os.freemem()
    return { availableFraction: Math.min(1, available / total) }
  }

  // MemAvailable already excludes reclaimable page cache.
  const memAvailable =
    readKey(readFile('/proc/meminfo'), 'MemAvailable') * 1024 || os.freemem()
  const cgroupV2Dir = getCgroupV2Dir()
  const cgroup = readCgroupHeadroom(cgroupV2Dir, total)
  const availableFraction = cgroup
    ? Math.min(memAvailable, cgroup.available) / cgroup.limit
    : memAvailable / total

  // System-wide PSI. Inside a container this may describe the whole host, so
  // prefer the cgroup's own when there is one; on Vercel's build machines
  // (one VM per build) the two are the same.
  const stall =
    (cgroupV2Dir &&
      readPressureStall(path.join(cgroupV2Dir, 'memory.pressure'))) ||
    readPressureStall('/proc/pressure/memory')

  return {
    availableFraction: Math.min(1, availableFraction),
    stallSome: stall?.some,
    stallFull: stall?.full,
  }
}

function readEnvNumber(name: string, fallback: number, max = Infinity): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 && value <= max ? value : fallback
}

/**
 * Whether memory pressure is tracked at all. Off by default on macOS: before
 * Node.js 24, `availableMemory()` there counts only free pages (not
 * reclaimable cache), so it would report constant pressure. Setting a
 * threshold turns it on.
 */
export function isMemoryPressureTrackingEnabled(): boolean {
  return (
    process.platform !== 'darwin' ||
    !!process.env.__NEXT_PRIVATE_MEMORY_PRESSURE_MODERATE ||
    !!process.env.__NEXT_PRIVATE_MEMORY_PRESSURE_CRITICAL
  )
}

/**
 * Turns samples into a pressure level. Pressure is the worse of two signals:
 * - Headroom: below `__NEXT_PRIVATE_MEMORY_PRESSURE_MODERATE` (default 15%)
 *   of memory available is moderate, below
 *   `__NEXT_PRIVATE_MEMORY_PRESSURE_CRITICAL` (default 5%) is critical.
 * - Stalls (Linux): some tasks stalled on memory for 10% of the last 10
 *   seconds is moderate, all tasks stalled for 10% is critical.
 *
 * A level is left only once the signals are comfortably below its threshold
 * again, so the level doesn't flap around a threshold.
 */
export class MemoryPressureTracker {
  private level: MemoryPressureLevel = 'none'
  private readonly moderate = readEnvNumber(
    '__NEXT_PRIVATE_MEMORY_PRESSURE_MODERATE',
    0.15,
    1
  )
  private readonly critical = Math.min(
    this.moderate,
    readEnvNumber('__NEXT_PRIVATE_MEMORY_PRESSURE_CRITICAL', 0.05, 1)
  )
  private readonly stallThreshold = 10

  get current(): MemoryPressureLevel {
    return this.level
  }

  /** Take a sample, update the level, and return it. */
  update(sample: MemorySample = readMemorySample()): MemoryPressureLevel {
    const rank = (level: MemoryPressureLevel) =>
      level === 'critical' ? 2 : level === 'moderate' ? 1 : 0
    // When leaving a level, require headroom 5 points above its threshold
    // and stalls at half of theirs.
    const holding = (level: MemoryPressureLevel) =>
      rank(this.level) >= rank(level)
    const headroomSlack = (level: MemoryPressureLevel) =>
      holding(level) ? 0.05 : 0
    const stallLimit = (level: MemoryPressureLevel) =>
      holding(level) ? this.stallThreshold / 2 : this.stallThreshold

    const { availableFraction, stallSome = 0, stallFull = 0 } = sample
    let next: MemoryPressureLevel = 'none'
    if (
      availableFraction < this.critical + headroomSlack('critical') ||
      stallFull >= stallLimit('critical')
    ) {
      next = 'critical'
    } else if (
      availableFraction < this.moderate + headroomSlack('moderate') ||
      stallSome >= stallLimit('moderate')
    ) {
      next = 'moderate'
    }

    if (next !== this.level) {
      debug(
        'memory pressure %s -> %s (%d% available, stalls some=%s full=%s)',
        this.level,
        next,
        Math.round(availableFraction * 100),
        sample.stallSome ?? 'n/a',
        sample.stallFull ?? 'n/a'
      )
      this.level = next
    }
    return next
  }
}

export interface MemoryPressureMonitorOptions {
  /** How often to sample memory. */
  intervalMs?: number
  /** How often to repeat a `critical` notification while it lasts. */
  criticalRepeatMs?: number
}

/**
 * Sample memory periodically and call `onChange` when the pressure level
 * changes, and every `criticalRepeatMs` while it is critical. Returns a
 * function that stops the monitor.
 */
export function startMemoryPressureMonitor(
  onChange: (notification: MemoryPressureNotification) => void,
  {
    intervalMs = 500,
    criticalRepeatMs = 2000,
  }: MemoryPressureMonitorOptions = {}
): () => void {
  if (!isMemoryPressureTrackingEnabled()) {
    return () => {}
  }

  const tracker = new MemoryPressureTracker()
  let level: MemoryPressureLevel = 'none'
  let lastCriticalNotification = 0

  const sample = () => {
    const next = tracker.update()
    const now = Date.now()
    if (
      next !== level ||
      (next === 'critical' &&
        now - lastCriticalNotification >= criticalRepeatMs)
    ) {
      level = next
      if (level === 'critical') lastCriticalNotification = now
      onChange({ type: 'memory-pressure', level })
    }
  }

  sample()
  const interval = setInterval(sample, intervalMs)
  interval.unref()
  return () => clearInterval(interval)
}

/**
 * Under memory pressure, wait until `pending` settles or the pressure goes
 * away, whichever comes first. Use it to hold off starting memory-hungry work
 * while other work is still releasing memory. Returns immediately when there
 * is no pressure. `onWait` is called once if it does have to wait.
 */
export async function waitWhileUnderMemoryPressure(
  pending: Promise<unknown>,
  onWait?: () => void,
  { intervalMs = 250 }: { intervalMs?: number } = {}
): Promise<void> {
  if (!isMemoryPressureTrackingEnabled()) return

  const tracker = new MemoryPressureTracker()
  if (tracker.update() === 'none') return

  let settled = false
  const done = pending.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  // Give work that's about to finish a moment before reporting a wait.
  await Promise.race([done, new Promise((r) => setTimeout(r, 0))])
  if (settled) return

  onWait?.()
  let timer: ReturnType<typeof setInterval> | undefined
  await Promise.race([
    done,
    new Promise<void>((resolve) => {
      timer = setInterval(() => {
        if (tracker.update() === 'none') resolve()
      }, intervalMs)
    }),
  ])
  clearInterval(timer)
}
