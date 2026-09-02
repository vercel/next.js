import { useEffect } from 'react'
import type { Metric } from 'next/dist/compiled/web-vitals'

// copied to prevent pulling in un-necessary utils
const WEB_VITALS = ['CLS', 'FID', 'LCP', 'INP', 'FCP', 'TTFB'] as const

type ReportWebVitalsCallback = (
  metric: Metric & { attribution?: Record<string, unknown> }
) => void

function trackWebVitals(reportWebVitalsFn: ReportWebVitalsCallback) {
  const attributions: string[] | undefined = process.env
    .__NEXT_WEB_VITALS_ATTRIBUTION as any

  for (const webVital of WEB_VITALS) {
    try {
      let mod: any
      if (process.env.__NEXT_HAS_WEB_VITALS_ATTRIBUTION) {
        if (attributions?.includes(webVital)) {
          mod =
            require('next/dist/compiled/web-vitals-attribution') as typeof import('next/dist/compiled/web-vitals-attribution')
        }
      }
      if (!mod) {
        mod =
          require('next/dist/compiled/web-vitals') as typeof import('next/dist/compiled/web-vitals')
      }
      mod[`on${webVital}`](reportWebVitalsFn)
    } catch (err) {
      // Do nothing if the module fails to load
      console.warn(`Failed to track ${webVital} web-vital`, err)
    }
  }
}

export function useReportWebVitals(reportWebVitalsFn: ReportWebVitalsCallback) {
  useEffect(() => {
    trackWebVitals(reportWebVitalsFn)
  }, [reportWebVitalsFn])
}
