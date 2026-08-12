import { useEffect } from 'react'
import {
  onLCP,
  onCLS,
  onINP,
  onFCP,
  onTTFB,
} from 'next/dist/compiled/web-vitals'
import type { Metric } from 'next/dist/compiled/web-vitals'

// Report the Core Web Vitals for soft navigations (client-side navigations) in
// addition to the initial page load. `web-vitals` feature detects the Soft
// Navigations API and keeps reporting only for the initial page load in
// browsers that don't support it.
// Metrics reported for a soft navigation have a `navigationType` of
// `'soft-navigation'` and a `navigationURL` of the URL they were measured for.
// https://github.com/GoogleChrome/web-vitals#report-metrics-for-soft-navigations
const softNavsOpts = { reportSoftNavs: true }

export function useReportWebVitals(
  reportWebVitalsFn: (metric: Metric) => void
) {
  useEffect(() => {
    onCLS(reportWebVitalsFn, softNavsOpts)
    onLCP(reportWebVitalsFn, softNavsOpts)
    onINP(reportWebVitalsFn, softNavsOpts)
    // FCP and TTFB are load metrics, so they keep reporting for the initial
    // page load only. Reporting TTFB for soft navigations would only ever
    // report `0`, since no server request is involved.
    onFCP(reportWebVitalsFn)
    onTTFB(reportWebVitalsFn)
  }, [reportWebVitalsFn])
}
