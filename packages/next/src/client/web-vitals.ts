import { useEffect, useRef } from 'react'
import {
  onLCP,
  onFID,
  onCLS,
  onINP,
  onFCP,
  onTTFB,
} from 'next/dist/compiled/web-vitals'
import type { Metric } from 'next/dist/compiled/web-vitals'

export function useReportWebVitals(
  reportWebVitalsFn: (metric: Metric) => void
) {
  const lcpReportedRef = useRef(false)

  useEffect(() => {
    // Finalize LCP when page becomes hidden or is being unloaded
    const finalizeLCP = () => {
      if (lcpReportedRef.current) {
        return
      }

      // Get the last LCP entry from performance entries
      const lcpEntries = performance.getEntriesByType(
        'largest-contentful-paint'
      ) as PerformanceEntry[]
      const lastEntry = lcpEntries[lcpEntries.length - 1]

      if (!lastEntry) {
        return
      }

      // For LargestContentfulPaint, use renderTime or loadTime if available
      // These values are already relative to navigation start
      // Otherwise fall back to startTime (also relative to navigation start)
      const lcpEntry = lastEntry as any
      const lcpValue =
        lcpEntry.renderTime || lcpEntry.loadTime || lastEntry.startTime

      const navigationEntry = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined

      // Normalize navigation type to match web-vitals format
      let navigationType:
        | 'navigate'
        | 'prerender'
        | 'reload'
        | 'back-forward'
        | 'back-forward-cache'
        | 'restore' = 'navigate'
      if (navigationEntry) {
        const type = navigationEntry.type
        if (type === 'back_forward') {
          navigationType = 'back-forward'
        } else if (
          type === 'navigate' ||
          type === 'reload' ||
          type === 'prerender'
        ) {
          navigationType = type
        }
      }

      const lcpMetric: Metric = {
        name: 'LCP',
        value: lcpValue,
        id: `${Date.now()}-${Math.floor(Math.random() * 1e12)}`,
        delta: lcpValue,
        entries: [lastEntry],
        rating:
          lcpValue < 2500
            ? 'good'
            : lcpValue < 4000
              ? 'needs-improvement'
              : 'poor',
        navigationType,
      }

      lcpReportedRef.current = true
      reportWebVitalsFn(lcpMetric)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        finalizeLCP()
      }
    }

    const handlePageHide = () => {
      finalizeLCP()
    }

    // Mark LCP as reported when web-vitals reports it normally
    const wrappedReportWebVitalsFn = (metric: Metric) => {
      if (metric.name === 'LCP') {
        lcpReportedRef.current = true
      }
      reportWebVitalsFn(metric)
    }

    // Register web vitals handlers
    onCLS(wrappedReportWebVitalsFn)
    onFID(wrappedReportWebVitalsFn)
    onLCP(wrappedReportWebVitalsFn)
    onINP(wrappedReportWebVitalsFn)
    onFCP(wrappedReportWebVitalsFn)
    onTTFB(wrappedReportWebVitalsFn)

    // Add event listeners for visibility change and page hide
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [reportWebVitalsFn])
}
