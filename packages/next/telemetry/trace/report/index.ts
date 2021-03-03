import { TARGET, SpanId } from '../types'
import reportToConsole from './to-console'
import reportToZipkin from './to-zipkin'
import reportToTelemetry from './to-telemetry'

export const noop = (
  _spanName: string,
  _duration: number,
  _timestamp: number,
  _id: SpanId,
  _parentId?: SpanId,
  _attrs?: Object
) => {}

const target =
  process.env.TRACE_TARGET && process.env.TRACE_TARGET in TARGET
    ? TARGET[process.env.TRACE_TARGET as TARGET]
    : TARGET.TELEMETRY

export let report = noop
if (target === TARGET.CONSOLE) {
  report = reportToConsole
} else if (target === TARGET.ZIPKIN) {
  report = reportToZipkin
} else {
  report = reportToTelemetry
}
