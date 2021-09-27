import { useEffect, useRef } from 'react'
import { NextWebVitalsMetric } from '../pages/_app'

type ReportWebVitalsCallback = (webVitals: NextWebVitalsMetric) => any
export const webVitalsCallbacks = new Set<ReportWebVitalsCallback>()
const metrics: NextWebVitalsMetric[] = []

export function trackWebVitalMetric(metric: NextWebVitalsMetric) {
  metrics.push(metric)
  webVitalsCallbacks.forEach((callback) => callback(metric))
}

export function useExperimentalWebVitalsReport(
  callback: ReportWebVitalsCallback
) {
  const metricIndexRef = useRef(0)

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
