import { useEffect, useRef } from 'react'
import { NextWebVitalsMetric } from '../../pages/_app'
import {
  getBufferedVitalsMetrics,
  getWebVitalsFlushed,
  ReportWebVitalsCallback,
  webVitalsCallbacks,
} from './vitals'

export function useWebVitalsReport(callback: ReportWebVitalsCallback) {
  const metricIndexRef = useRef(0)

  if (process.env.NODE_ENV === 'development') {
    if (getWebVitalsFlushed()) {
      console.error(
        'The `useWebVitalsReport` hook was called too late -- did you use it inside of a <Suspense> boundary?'
      )
    }
  }

  useEffect(() => {
    const metrics = getBufferedVitalsMetrics()

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
