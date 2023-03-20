import { useEffect } from 'react'
import { onLCP, onFID, onCLS, onINP, onFCP, onTTFB, Metric } from 'web-vitals'

export function useReportWebVitals(reportWebVitalsFn: (metric: Metric) => {}) {
  useEffect(() => {
    onCLS(reportWebVitalsFn)
    onFID(reportWebVitalsFn)
    onLCP(reportWebVitalsFn)
    onINP(reportWebVitalsFn)
    onFCP(reportWebVitalsFn)
    onTTFB(reportWebVitalsFn)
  }, [reportWebVitalsFn])
}
