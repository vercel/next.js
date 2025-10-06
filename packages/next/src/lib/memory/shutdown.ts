import { info } from '../../build/output/log'
import { bold } from '../picocolors'
import { getGcEvents, stopObservingGc } from './gc-observer'
import { getAllMemoryUsageSpans, stopPeriodicMemoryUsageTracing } from './trace'

export function disableMemoryDebuggingMode(): void {
  stopPeriodicMemoryUsageTracing()
  stopObservingGc()

  info(bold('Memory usage report:'))

  const gcEvents = getGcEvents()
  const totalTimeInGcMs = gcEvents.reduce(
    (acc, event) => acc + event.duration,
    0
  )
  info(` - Total time spent in GC: ${totalTimeInGcMs.toFixed(2)}ms`)

  const allMemoryUsage = getAllMemoryUsageSpans()
  const peakHeapUsage = Math.max(
    ...allMemoryUsage.map((usage) => usage['memory.heapUsed'])
  )
  const peakRssUsage = Math.max(
    ...allMemoryUsage.map((usage) => usage['memory.rss'])
  )
  info(` - Peak heap usage: ${(peakHeapUsage / 1024 / 1024).toFixed(2)} MB`)
  info(` - Peak RSS usage: ${(peakRssUsage / 1024 / 1024).toFixed(2)} MB`)
}
