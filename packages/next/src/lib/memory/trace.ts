import v8 from 'v8'
import { info, warn } from '../../build/output/log'
import { type Span, trace } from '../../trace'
import { bold, italic } from '../picocolors'
import { join } from 'path'
import { traceGlobals } from '../../trace/shared'

const HEAP_SNAPSHOT_THRESHOLD_PERCENT = 70
let alreadyGeneratedHeapSnapshot = false

const TRACE_MEMORY_USAGE_TIMER_MS = 20000
let traceMemoryUsageTimer: NodeJS.Timeout | undefined

interface MemoryUsage {
  'memory.rss': number
  'memory.heapUsed': number
  'memory.heapTotal': number
  'memory.heapMax': number
}

const allMemoryUsage: MemoryUsage[] = []

/**
 * Begins a timer that will record memory usage periodically to understand
 * memory usage across the lifetime of the process.
 */
export function startPeriodicMemoryUsageTracing(): void {
  traceMemoryUsageTimer = setTimeout(() => {
    traceMemoryUsage('periodic memory snapshot')
    startPeriodicMemoryUsageTracing()
  }, TRACE_MEMORY_USAGE_TIMER_MS)
}

export function stopPeriodicMemoryUsageTracing(): void {
  if (traceMemoryUsageTimer) {
    clearTimeout(traceMemoryUsageTimer)
  }
}

/**
 * Returns the list of all recorded memory usage snapshots from the process.
 */
export function getAllMemoryUsageSpans(): MemoryUsage[] {
  return allMemoryUsage
}

/**
 * Records a snapshot of memory usage at this moment in time to the .next/trace
 * file.
 */
export function traceMemoryUsage(
  description: string,
  parentSpan?: Span | undefined
): void {
  const memoryUsage = process.memoryUsage()
  const v8HeapStatistics = v8.getHeapStatistics()
  const heapUsed = v8HeapStatistics.used_heap_size
  const heapMax = v8HeapStatistics.heap_size_limit
  const tracedMemoryUsage: MemoryUsage = {
    'memory.rss': memoryUsage.rss,
    'memory.heapUsed': heapUsed,
    'memory.heapTotal': memoryUsage.heapTotal,
    'memory.heapMax': heapMax,
  }
  allMemoryUsage.push(tracedMemoryUsage)
  const tracedMemoryUsageAsStrings = Object.fromEntries(
    Object.entries(tracedMemoryUsage).map(([key, value]) => [
      key,
      String(value),
    ])
  )
  if (parentSpan) {
    parentSpan.traceChild('memory-usage', tracedMemoryUsageAsStrings)
  } else {
    trace('memory-usage', undefined, tracedMemoryUsageAsStrings)
  }
  if (process.env.EXPERIMENTAL_DEBUG_MEMORY_USAGE) {
    const percentageHeapUsed = (100 * heapUsed) / heapMax

    info('')
    info('***************************************')
    info(`Memory usage report at "${description}":`)
    info(` - RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`)
    info(` - Heap Used: ${(heapUsed / 1024 / 1024).toFixed(2)} MB`)
    info(
      ` - Heap Total Allocated: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(
        2
      )} MB`
    )
    info(` - Heap Max: ${(heapMax / 1024 / 1024).toFixed(2)} MB`)
    info(` - Percentage Heap Used: ${percentageHeapUsed.toFixed(2)}%`)
    info('***************************************')
    info('')

    if (percentageHeapUsed > HEAP_SNAPSHOT_THRESHOLD_PERCENT) {
      const distDir = traceGlobals.get('distDir')
      const heapFilename = join(
        distDir,
        `${description.replace(' ', '-')}.heapsnapshot`
      )
      warn(
        bold(
          `Heap usage is close to the limit. ${percentageHeapUsed.toFixed(
            2
          )}% of heap has been used.`
        )
      )
      if (!alreadyGeneratedHeapSnapshot) {
        warn(
          bold(
            `Saving heap snapshot to ${heapFilename}.  ${italic(
              'Note: this will take some time.'
            )}`
          )
        )
        v8.writeHeapSnapshot(heapFilename)
        alreadyGeneratedHeapSnapshot = true
      } else {
        warn(
          'Skipping heap snapshot generation since heap snapshot has already been generated.'
        )
      }
    }
  }
}
