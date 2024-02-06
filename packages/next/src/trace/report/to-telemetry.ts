import type { Telemetry } from '../../telemetry/storage'
import { traceGlobals } from '../shared'
import type { TraceEvent } from '../types'

const TRACE_EVENT_ACCESSLIST = new Map(
  Object.entries({
    'webpack-invalidated': 'WEBPACK_INVALIDATED',
  })
)

const reportToTelemetry = ({ name, duration }: TraceEvent) => {
  const eventName = TRACE_EVENT_ACCESSLIST.get(name)
  if (!eventName) {
    return
  }
  const telemetry: Telemetry | undefined = traceGlobals.get('telemetry')
  if (!telemetry) {
    return
  }

  telemetry.record({
    eventName,
    payload: {
      durationInMicroseconds: duration,
    },
  })
}

export default {
  flushAll: () => {},
  report: reportToTelemetry,
}
