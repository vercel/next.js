import { useEffect } from 'react'
import {
  onLCP,
  onCLS,
  onINP,
  onFCP,
  onTTFB,
} from 'next/dist/compiled/web-vitals'
import type { Metric } from 'next/dist/compiled/web-vitals'

const customNextMetrics = [
  'Next.js-hydration',
  'Next.js-before-hydration',
  'Next.js-route-change-to-render',
  'Next.js-render',
]

export function useReportWebVitals(
  reportWebVitalsFn: (metric: Metric | any) => void
) {
  useEffect(() => {
    onCLS(reportWebVitalsFn, { reportSoftNavs: true })
    onLCP(reportWebVitalsFn, { reportSoftNavs: true })
    onINP(reportWebVitalsFn, { reportSoftNavs: true })
    onFCP(reportWebVitalsFn, { reportSoftNavs: true })
    onTTFB(reportWebVitalsFn)

    // Also observe and dispatch Next.js custom performance metrics
    // (such as Next.js-hydration) if performance observer is supported
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (customNextMetrics.includes(entry.name)) {
              reportWebVitalsFn({
                id: entry.name,
                name: entry.name,
                startTime: entry.startTime,
                value: entry.duration,
                label: 'custom',
                rating: 'good',
                navigationType: 'navigate',
                entries: [entry],
              })
            }
          }
        })
        observer.observe({ entryTypes: ['measure'] })
        return () => observer.disconnect()
      } catch {
        // Fallback or unsupported environment
      }
    }
  }, [reportWebVitalsFn])
}
