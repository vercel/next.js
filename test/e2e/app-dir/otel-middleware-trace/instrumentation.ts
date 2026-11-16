import { registerOTel } from '@vercel/otel'
import { spanRecorder } from './trace-recorder'

export function register() {
  // No exporter is needed: the span recorder writes the spans to the console,
  // where the test collects them (from the runtime logs when deployed, where no
  // local collector is reachable).
  registerOTel({
    serviceName: 'otel-middleware-trace',
    spanProcessors: [spanRecorder],
  })
}
