import { trace, flushAllTraces, Span, SpanStatus } from './trace'
import { SpanId, setGlobal } from './shared'

export { trace, flushAllTraces, Span, setGlobal, SpanStatus }
export type { SpanId }
