import { useEffect, useRef } from 'react'
import { NextWebVitalsMetric } from '../pages/_app'

type ReportWebVitalsCallback = (webVitals: NextWebVitalsMetric) => any
export const webVitalsCallbacks = new Set<ReportWebVitalsCallback>()

let flushed = false
export const bufferedVitalsMetrics: NextWebVitalsMetric[] = []

export function flushBufferedVitalsMetrics() {
  flushed = true
  bufferedVitalsMetrics.length = 0
}

export function trackWebVitalMetric(metric: NextWebVitalsMetric) {
  bufferedVitalsMetrics.push(metric)
  webVitalsCallbacks.forEach((callback) => callback(metric))
}

export function useWebVitalsReport(callback: ReportWebVitalsCallback) {
  const metricIndexRef = useRef(0)

  if (process.env.NODE_ENV === 'development') {
    if (flushed) {
      console.error(
        `Web vitals reporting callback is attached too late, please attach it before page is mounted.`
      )
    }
  }

  useEffect(() => {
    // Flush calculated metrics
    const reportMetric = (metric: NextWebVitalsMetric) => {
      callback(metric)
      metricIndexRef.current = bufferedVitalsMetrics.length
    }
    for (
      let i = metricIndexRef.current;
      i < bufferedVitalsMetrics.length;
      i++
    ) {
      reportMetric(bufferedVitalsMetrics[i])
    }

    webVitalsCallbacks.add(reportMetric)
    return () => {
      webVitalsCallbacks.delete(reportMetric)
    }
  }, [callback])
}
