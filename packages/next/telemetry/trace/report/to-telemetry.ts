import { traceGlobals } from '../shared'

const TRACE_EVENT_ACCESSLIST = new Map(
  Object.entries({
    'webpack-invalidated': 'WEBPACK_INVALIDATED',
  })
)

const reportToTelemetry = (spanName: string, duration: number) => {
  const eventName = TRACE_EVENT_ACCESSLIST.get(spanName)
  if (!eventName) {
    return
  }
  const telemetry = traceGlobals.get('telemetry')
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

export default reportToTelemetry
