import { randomBytes } from 'crypto'
import reportToConsole from './to-console'
import reportToLocalHost from './to-localhost'
import reportToTelemetry from './to-telemetry'

let idCounter = 0
const idUniqToProcess = randomBytes(16).toString('base64').slice(0, 22)
const getId = () => `${idUniqToProcess}:${idCounter++}`

const noop = (
  _spanName: string,
  _duration: number,
  _id: string | null,
  _parentId: string | null,
  _attrs: Object
) => {}

enum TARGET {
  CONSOLE = 'CONSOLE',
  LOCALHOST = 'LOCALHOST',
  TELEMETRY = 'TELEMETRY',
}

const target =
  process.env.TRACE_TARGET && process.env.TRACE_TARGET in TARGET
    ? TARGET[process.env.TRACE_TARGET as TARGET]
    : TARGET.TELEMETRY
const traceLevel = process.env.TRACE_LEVEL
  ? Number.parseInt(process.env.TRACE_LEVEL)
  : 1

let report = noop
if (target === TARGET.CONSOLE) {
  report = reportToConsole
} else if (target === TARGET.LOCALHOST) {
  report = reportToLocalHost
} else {
  report = reportToTelemetry
}

// This function reports durations in microseconds. This gives 1000x
// the precision of something like Date.now(), which reports in
// milliseconds.  Additionally, ~285 years can be safely represented
// as microseconds as a float64 in both JSON and JavaScript.
const trace = (spanName: string, parentId: string | null, attrs: Object) => {
  const endSpan = () => {
    const id = getId()
    const end: bigint = process.hrtime.bigint()
    const duration = end - start
    if (duration > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Duration is too long to express as float64: ${duration}`)
    }
    report(spanName, Number(duration), id, parentId, attrs)
  }

  const start: bigint = process.hrtime.bigint()
  return endSpan
}

module.exports = {
  TARGET,
  primary: traceLevel >= 1 ? trace : noop,
  secondary: traceLevel >= 2 ? trace : noop,
  sensitive: traceLevel >= 3 ? trace : noop,
}
