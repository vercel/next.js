import { traceGlobals } from '../../trace/shared'
import { Telemetry } from '../storage'

const EVENT_PLUGIN_PRESENT = 'NEXT_SWC_LOAD_FAILURE'
export type EventSwcLoadFailure = {
  eventName: string
  payload: {
    platform: string
    arch: string
    nodeVersion: string
    nextVersion: string
    wasm?: string
    glibcVersion?: string
    installedSwcPackages?: string
  }
}

export async function eventSwcLoadFailure(
  event: EventSwcLoadFailure['payload']
): Promise<void> {
  const telemetry: Telemetry = traceGlobals.get('telemetry')
  // can't continue if telemetry isn't set
  if (!telemetry) return

  telemetry.record({
    eventName: EVENT_PLUGIN_PRESENT,
    payload: event,
  })
  // ensure this event is flushed before process exits
  await telemetry.flush()
}
