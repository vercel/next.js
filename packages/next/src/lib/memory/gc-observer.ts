import { PerformanceObserver } from 'perf_hooks'
import { warn } from '../../build/output/log'
import { bold } from '../picocolors'

const LONG_RUNNING_GC_THRESHOLD_MS = 15

const gcEvents: PerformanceEntry[] = []
const obs = new PerformanceObserver((list) => {
  const entry = list.getEntries()[0]
  gcEvents.push(entry)

  if (entry.duration > LONG_RUNNING_GC_THRESHOLD_MS) {
    warn(bold(`Long running GC detected: ${entry.duration.toFixed(2)}ms`))
  }
})

/**
 * Starts recording garbage collection events in the process and warn on long
 * running GCs. To disable, call `stopObservingGc`.
 */
export function startObservingGc() {
  obs.observe({ entryTypes: ['gc'] })
}

export function stopObservingGc() {
  obs.disconnect()
}

/**
 * Returns all recorded garbage collection events. This function will only
 * return information from when `startObservingGc` was enabled and before
 * `stopObservingGc` was called.
 */
export function getGcEvents() {
  return gcEvents
}
