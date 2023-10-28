import reportToTelemetry from './to-telemetry'
import reportToJson from './to-json'
import type { TraceEvent } from '../types'
import type { Reporter } from './types'

class MultiReporter implements Reporter {
  private events: TraceEvent[] = []
  private reporters: Reporter[] = []

  constructor(reporters: Reporter[]) {
    this.reporters = reporters
  }

  async flushAll() {
    await Promise.all(this.reporters.map((reporter) => reporter.flushAll()))
  }

  getTraceEvents() {
    return this.events
  }

  clearTraceEvents() {
    this.events = []
  }

  report(event: TraceEvent) {
    this.events.push(event)
    this.reporters.forEach((reporter) => reporter.report(event))
  }
}

// JSON is always reported to allow for diagnostics
export const reporter = new MultiReporter([reportToJson, reportToTelemetry])
