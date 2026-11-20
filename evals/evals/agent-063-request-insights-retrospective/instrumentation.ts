import { startTelemetry } from '@/lib/telemetry'

export async function register() {
  await startTelemetry()
}
