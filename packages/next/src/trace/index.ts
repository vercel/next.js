import { trace, flushAllTraces, Span, SpanStatus } from './trace'
import type { SpanId } from './shared'
import { setGlobal } from './shared'

export { trace, flushAllTraces, Span, setGlobal, SpanStatus }
export type { SpanId }
