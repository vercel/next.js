import { traceGlobals } from '../trace/shared'

export async function flushAndExit(code: number) {
  let telemetry = traceGlobals.get('telemetry') as
    | InstanceType<typeof import('./storage').Telemetry>
    | undefined
  if (telemetry) {
    await telemetry.flush()
  }
  process.exit(code)
}
