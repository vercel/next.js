import type { TraceEvent } from '../types'
import reportToTelemetry from './to-telemetry'
import reportToJson from './to-json'
import type { Reporter } from './types'

class MultiReporter implements Reporter {
  private reporters: Reporter[] = []

  constructor(reporters: Reporter[]) {
    this.reporters = reporters
  }

  async flushAll() {
    await Promise.all(this.reporters.map((reporter) => reporter.flushAll()))
  }

  report(event: TraceEvent) {
    this.reporters.forEach((reporter) => reporter.report(event))
  }
}

// JSON is always reported to allow for diagnostics
export const reporter = new MultiReporter([reportToJson, reportToTelemetry])
