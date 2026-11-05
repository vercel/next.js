import {
  type captureLocalSpanContext,
  createLocalSpanId,
} from './local-span-recorder'
import type { SpanStoreRecord } from './span-store'
import type { ReactTimingRecord } from '../../../shared/lib/react-debug-timing'

export function createReactTimingSpanRecords(
  timings: readonly ReactTimingRecord[],
  context: ReturnType<typeof captureLocalSpanContext>,
  renderId: string
): SpanStoreRecord[] {
  return timings.map((timing) => ({
    ...context,
    name: `ReactServerComponents.${timing.kind}`,
    spanId: createLocalSpanId(context.parentSpanId),
    timestamp: timing.startTime + timing.durationMs,
    startTime: timing.startTime,
    durationMs: timing.durationMs,
    status:
      timing.outcome === 'errored'
        ? 'error'
        : timing.outcome === 'completed'
          ? 'ok'
          : undefined,
    attributes: {
      'next.span_type': `ReactServerComponents.${timing.kind}`,
      'next.span_name': `${timing.kind === 'component' ? 'render' : 'await'} ${timing.name}`,
      'next.span_category': 'application',
      'next.rsc.kind': timing.kind,
      'next.rsc.render_id': renderId,
      'next.rsc.environment': timing.environment,
      'next.rsc.observation': 'decoded',
      ...(timing.outcome ? { 'next.rsc.outcome': timing.outcome } : {}),
      'next.rsc.timing':
        timing.kind === 'component' ? 'render-interval' : 'await',
      ...(timing.source
        ? {
            'next.rsc.source.file': timing.source.file,
            'next.rsc.source.line': timing.source.line,
            'next.rsc.source.column': timing.source.column,
            'next.rsc.source.name': timing.source.methodName,
          }
        : {}),
      ...(timing.ownerName ? { 'next.rsc.owner': timing.ownerName } : {}),
      ...(timing.componentPath
        ? { 'next.rsc.component_path': timing.componentPath }
        : {}),
    },
  }))
}
