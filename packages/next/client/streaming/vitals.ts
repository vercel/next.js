import { NextWebVitalsMetric } from '../../pages/_app'

export type ReportWebVitalsCallback = (webVitals: NextWebVitalsMetric) => any
export const webVitalsCallbacks = new Set<ReportWebVitalsCallback>()

let flushed = false
const metrics: NextWebVitalsMetric[] = []

export function getBufferedVitalsMetrics() {
  return metrics
}

export function flushBufferedVitalsMetrics() {
  flushed = true
  metrics.length = 0
}

export function trackWebVitalMetric(metric: NextWebVitalsMetric) {
  metrics.push(metric)
  webVitalsCallbacks.forEach((callback) => callback(metric))
}

export function getWebVitalsFlushed() {
  return flushed
}
