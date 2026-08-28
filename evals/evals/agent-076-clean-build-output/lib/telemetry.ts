import { record, transport } from '../vendor/telemetry-client/index.cjs'

export function trackPageview(path: string): string {
  return record('pageview:' + path)
}

export function telemetryTransport(): string {
  return transport()
}
