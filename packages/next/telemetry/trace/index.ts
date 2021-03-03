import { trace, Span, SpanStatus } from './trace'
import { noop } from './report'
import { SpanId } from './types'
import { stackPush, stackPop } from './autoparent'

const traceLevel = process.env.TRACE_LEVEL
  ? Number.parseInt(process.env.TRACE_LEVEL)
  : 1
const primary = traceLevel >= 1 ? trace : noop
const secondary = traceLevel >= 2 ? trace : noop
const sensitive = traceLevel >= 3 ? trace : noop

export {
  trace,
  traceLevel,
  primary,
  secondary,
  sensitive,
  SpanId,
  Span,
  SpanStatus,
  stackPush,
  stackPop,
}
