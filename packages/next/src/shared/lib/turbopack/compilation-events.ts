import type { Project } from '../../../build/swc/types'
import * as Log from '../../../build/output/log'

/**
 * Subscribes to compilation events for `project` and prints them using the
 * `Log` library.
 *
 * The `signal` argument is partially implemented. The abort may not happen until the next
 * compilation event arrives.
 */
export function backgroundLogCompilationEvents(
  project: Project,
  { eventTypes, signal }: { eventTypes?: string[]; signal?: AbortSignal } = {}
) {
  ;(async function () {
    for await (const event of project.compilationEventsSubscribe(eventTypes)) {
      if (signal?.aborted) {
        return
      }
      switch (event.severity) {
        case 'EVENT':
          Log.event(event.message)
          break
        case 'TRACE':
          Log.trace(event.message)
          break
        case 'INFO':
          Log.info(event.message)
          break
        case 'WARNING':
          Log.warn(event.message)
          break
        case 'ERROR':
          Log.error(event.message)
          break
        case 'FATAL':
          Log.error(event.message)
          break
        default:
          break
      }
    }
  })()
}
