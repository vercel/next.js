import { SpanId } from '../shared'
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
    attrs?: Object,
    startTime?: number
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
    attrs?: Object,
    startTime?: number
  ) {
    this.reporters.forEach((reporter) =>
      reporter.report(
        spanName,
        duration,
        timestamp,
        id,
        parentId,
        attrs,
        startTime
      )
    )
  }
}

// JSON is always reported to allow for diagnostics
export const reporter = new MultiReporter([reportToJson, reportToTelemetry])
