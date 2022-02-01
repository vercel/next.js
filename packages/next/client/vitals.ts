import { useEffect, useRef } from 'react'
import { NextWebVitalsMetric } from '../pages/_app'

type ReportWebVitalsCallback = (webVitals: NextWebVitalsMetric) => any
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

export function useWebVitalsReport(callback: ReportWebVitalsCallback) {
  const metricIndexRef = useRef(0)

  if (process.env.NODE_ENV === 'development') {
    if (flushed) {
      console.error(
        'The `useWebVitalsReport` hook was called too late -- did you use it inside of a <Suspense> boundary?'
      )
    }
  }

  useEffect(() => {
    // Flush calculated metrics
    const reportMetric = (metric: NextWebVitalsMetric) => {
      callback(metric)
      metricIndexRef.current = metrics.length
    }
    for (let i = metricIndexRef.current; i < metrics.length; i++) {
      reportMetric(metrics[i])
    }

    webVitalsCallbacks.add(reportMetric)
    return () => {
      webVitalsCallbacks.delete(reportMetric)
    }
  }, [callback])
}
