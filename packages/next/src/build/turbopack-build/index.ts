import { NextBuildContext } from '../build-context'
import { getTracer } from '../../server/lib/trace/tracer'
import { ToolingSpan } from '../../server/lib/trace/constants'
import type { Telemetry } from '../../telemetry/storage'
import { turbopackBuild as turbopackBuildImpl } from './impl'

export function turbopackBuild(
  telemetry: Telemetry
): ReturnType<typeof turbopackBuildImpl> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return getTracer().trace(
    ToolingSpan.runTurbopack,
    { parent: nextBuildSpan },
    () => turbopackBuildImpl(telemetry)
  )
}
