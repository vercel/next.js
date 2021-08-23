import { TARGET, SpanId } from '../shared'
import reportToConsole from './to-console'
import reportToZipkin from './to-zipkin'
import reportToJaeger from './to-jaeger'
import reportToTelemetry from './to-telemetry'

type Reporter = {
  flushAll: () => Promise<void> | void
  report: (
    spanName: string,
    duration: number,
    timestamp: number,
    id: SpanId,
    parentId?: SpanId,
    attrs?: Object
  ) => void
}

const target =
  process.env.TRACE_TARGET && process.env.TRACE_TARGET in TARGET
    ? TARGET[process.env.TRACE_TARGET as TARGET]
    : TARGET.TELEMETRY

if (process.env.TRACE_TARGET && !target) {
  console.info(
    'For TRACE_TARGET, please specify one of: CONSOLE, ZIPKIN, TELEMETRY'
  )
}

export let reporter: Reporter

if (target === TARGET.CONSOLE) {
  reporter = reportToConsole
} else if (target === TARGET.ZIPKIN) {
  reporter = reportToZipkin
} else if (target === TARGET.JAEGER) {
  reporter = reportToJaeger
} else {
  reporter = reportToTelemetry
}
