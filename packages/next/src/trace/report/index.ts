import type { TraceEvent } from '../types'
import reportToTelemetry from './to-telemetry'
import reportToJson from './to-json'
import reportToJsonBuild from './to-json-build'
import type { Reporter } from './types'

class MultiReporter implements Reporter {
  private reporters: Reporter[] = []

  constructor(reporters: Reporter[]) {
    this.reporters = reporters
  }

  flushAll() {
    this.reporters.forEach((reporter) => reporter.flushAll())
  }

  report(event: TraceEvent) {
    this.reporters.forEach((reporter) => reporter.report(event))
  }
}

// JSON is always reported to allow for diagnostics
export const reporter = new MultiReporter([
  reportToJson,
  reportToJsonBuild,
  reportToTelemetry,
])
