import { useEffect } from 'react'
import {
  onLCP,
  onCLS,
  onINP,
  onFCP,
  onTTFB,
} from 'next/dist/compiled/web-vitals'
import type { Metric } from 'next/dist/compiled/web-vitals'

export function useReportWebVitals(
  reportWebVitalsFn: (metric: Metric) => void
) {
  useEffect(() => {
    onCLS(reportWebVitalsFn, { reportSoftNavs: true })
    onLCP(reportWebVitalsFn, { reportSoftNavs: true })
    onINP(reportWebVitalsFn, { reportSoftNavs: true })
    onFCP(reportWebVitalsFn)
    onTTFB(reportWebVitalsFn)
  }, [reportWebVitalsFn])
}
