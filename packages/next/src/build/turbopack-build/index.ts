import { NextBuildContext } from '../build-context'
import type { Telemetry } from '../../telemetry/storage'

export function turbopackBuild(
  telemetry: Telemetry
): ReturnType<typeof import('./impl').turbopackBuild> {
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  return nextBuildSpan.traceChild('run-turbopack').traceAsyncFn(async () => {
    const build = (require('./impl') as typeof import('./impl')).turbopackBuild
    return await build(telemetry)
  })
}
