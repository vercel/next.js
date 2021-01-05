import {
  getCLS,
  getFCP,
  getFID,
  getLCP,
  getTTFB,
  Metric,
  ReportHandler,
} from 'next/dist/compiled/web-vitals'

const initialHref = location.href
let isRegistered = false
let userReportHandler: ReportHandler | undefined

function onReport(metric: Metric): void {
  if (userReportHandler) {
    userReportHandler(metric)
  }

  // This code is not shipped, executed, or present in the client-side
  // JavaScript bundle unless explicitly enabled in your application.
  //
  // When this feature is enabled, we'll make it very clear by printing a
  // message during the build (`next build`).
  if (
    process.env.NODE_ENV === 'production' &&
    // This field is empty unless you explicitly configure it:
    process.env.__NEXT_ANALYTICS_ID
  ) {
    const body: Record<string, string> = {
      dsn: process.env.__NEXT_ANALYTICS_ID,
      id: metric.id,
      page: window.__NEXT_DATA__.page,
      href: initialHref,
      event_name: metric.name,
      value: metric.value.toString(),
      speed:
        'connection' in navigator &&
        navigator['connection'] &&
        'effectiveType' in navigator['connection']
          ? (navigator['connection']['effectiveType'] as string)
          : '',
    }

    const blob = new Blob([new URLSearchParams(body).toString()], {
      // This content type is necessary for `sendBeacon`:
      type: 'application/x-www-form-urlencoded',
    })
    const vitalsUrl = 'https://vitals.vercel-insights.com/v1/vitals'
    ;(navigator.sendBeacon && navigator.sendBeacon(vitalsUrl, blob)) ||
      fetch(vitalsUrl, {
        body: blob,
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
      })
  }
}

export default (onPerfEntry?: ReportHandler): void => {
  // Update function if it changes:
  userReportHandler = onPerfEntry

  // Only register listeners once:
  if (isRegistered) {
    return
  }
  isRegistered = true

  getCLS(onReport)
  getFID(onReport)
  getFCP(onReport)
  getLCP(onReport)
  getTTFB(onReport)
}
