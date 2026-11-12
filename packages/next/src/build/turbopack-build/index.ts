import { Span } from '../../trace'
import { NextBuildContext } from '../build-context'
import type { Telemetry } from '../../telemetry/storage'
import { turbopackBuild as turbopackBuildImpl } from './impl'

export function turbopackBuild(
  telemetry: Telemetry
): ReturnType<typeof turbopackBuildImpl> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return new Span({
    name: 'run-turbopack',
    parent: nextBuildSpan,
    recordToInsights: true,
    scope: true,
  }).traceAsyncFn(() => turbopackBuildImpl(telemetry))
}
