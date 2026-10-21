import { registerOTel } from '@vercel/otel'
import { spanRecorder } from './trace-recorder'

export function register() {
  // No exporter is needed: the app itself reports the spans of a request, so
  // the suite also works when deployed (where no local collector is
  // reachable).
  registerOTel({
    serviceName: 'otel-middleware-single-trace',
    spanProcessors: [spanRecorder],
  })
}
