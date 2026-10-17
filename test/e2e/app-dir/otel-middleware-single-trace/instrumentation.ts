import { registerOTel } from '@vercel/otel'
import { parentRecorder } from './trace-recorder'

export function register() {
  // No exporter is needed: the app itself reports the trace and parent span
  // IDs, so the suite also works when deployed (where no local collector is
  // reachable).
  registerOTel({
    serviceName: 'otel-middleware-single-trace',
    spanProcessors: [parentRecorder],
  })
}
