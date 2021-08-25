import { TARGET, SpanId } from '../shared'
import reportToConsole from './to-console'
import reportToZipkin from './to-zipkin'
import reportToJaeger from './to-jaeger'
import reportToTelemetry from './to-telemetry'
import reportToJson from './to-json'

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

class MultiReporter implements Reporter {
  private reporters: Reporter[] = []

  constructor(reporters: Reporter[]) {
    this.reporters = reporters
  }

  async flushAll() {
    await Promise.all(this.reporters.map((reporter) => reporter.flushAll()))
  }

  report(
    spanName: string,
    duration: number,
    timestamp: number,
    id: SpanId,
    parentId?: SpanId,
    attrs?: Object
  ) {
    this.reporters.forEach((reporter) =>
      reporter.report(spanName, duration, timestamp, id, parentId, attrs)
    )
  }
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

let traceTargetReporter: Reporter

if (target === TARGET.CONSOLE) {
  traceTargetReporter = reportToConsole
} else if (target === TARGET.ZIPKIN) {
  traceTargetReporter = reportToZipkin
} else if (target === TARGET.JAEGER) {
  traceTargetReporter = reportToJaeger
} else {
  traceTargetReporter = reportToTelemetry
}

// JSON is always reported to allow for diagnostics
export const reporter = new MultiReporter([reportToJson, traceTargetReporter])
