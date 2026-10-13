import { registerOTel } from '@vercel/otel'

export function register() {
  // No exporter is needed: the app itself reports the active trace IDs, so the
  // suite also works when deployed (where no local collector is reachable).
  registerOTel({ serviceName: 'otel-middleware-single-trace' })
}
