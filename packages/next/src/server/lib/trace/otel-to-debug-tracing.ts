import type { NextTracer } from './tracer'
import { BaseServerSpan } from './constants'
import { Span } from '../../../trace/trace'
import { TimeInput } from '@opentelemetry/api'
import { PHASE_DEVELOPMENT_SERVER } from '../../../shared/lib/constants'
import { traceGlobals } from '../../../trace/shared'

const NUM_OF_NANOSEC_IN_SEC = BigInt(10 ** 9)
const NUM_OF_NANOSEC_IN_MILLISEC = BigInt(10 ** 6)

const SPAN_KINDS = new Map([
  [
    BaseServerSpan.handleRequest,
    {
      name: 'base-server-span.handle-request',
      getSampleRate: () =>
        traceGlobals.get('phase') === PHASE_DEVELOPMENT_SERVER
          ? // Only report 1 in 10 requests in development.
            10
          : // Don't trace requests here in production. They're already traced
            // by the OTEL tracer.
            Infinity,
    },
  ],
])

/**
 * Relay events emitted on the passed tracer of OTEL spans to the custom Next.js
 * tracing stored at `.next/trace`
 */
export function relayOtelToDebugTracing(tracer: NextTracer): () => void {
  return tracer.onSpanEnd((options, stopTime) => {
    const spanDescriptor = SPAN_KINDS.get(
      options.attributes?.['next.span_type'] as BaseServerSpan
    )
    if (spanDescriptor == null) {
      return
    }

    const startTime = options.startTime
    if (startTime == null) {
      return
    }

    const sampleRate = spanDescriptor.getSampleRate()
    if (Math.random() > 1 / sampleRate) {
      return
    }

    new Span({
      name: spanDescriptor.name,
      startTime: timeInputToBigInt(startTime),
      parentId: 0,
      attrs: {
        ...options.attributes,
        'next.sample_rate': sampleRate,
      },
    }).stop(timeInputToBigInt(stopTime))
  })
}

function timeInputToBigInt(timeInput: TimeInput): bigint {
  if (timeInput instanceof Date) {
    return BigInt(timeInput.getTime()) * NUM_OF_NANOSEC_IN_MILLISEC
  } else if (typeof timeInput === 'number') {
    return BigInt(timeInput) * NUM_OF_NANOSEC_IN_MILLISEC
  } else if (Array.isArray(timeInput)) {
    return BigInt(timeInput[0]) * NUM_OF_NANOSEC_IN_SEC + BigInt(timeInput[1])
  } else {
    throw new Error('Unexpected timeInput type')
  }
}
