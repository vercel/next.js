'use client'
import { useReportWebVitals } from 'next/web-vitals'

declare global {
  interface Window {
    __metrics: Array<{ name: string; attributionKeys: string[] | null }>
  }
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    window.__metrics = window.__metrics || []
    window.__metrics.push({
      name: metric.name,
      attributionKeys: metric.attribution
        ? Object.keys(metric.attribution)
        : null,
    })
  })
  return null
}
