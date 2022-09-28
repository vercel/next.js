/* global location */
import { Metric, ReportCallback } from 'next/dist/compiled/web-vitals'

interface PerformanceRelayerConfig {
  attributions: Array<typeof WEB_VITALS[number]>
}

const WEB_VITALS = ['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'] as const
const initialHref = location.href
let isRegistered = false
let userReportHandler: ReportCallback | undefined
let config: PerformanceRelayerConfig | undefined

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
      page: window.__NEXT_DATA__?.page,
      href: initialHref,
      event_name: metric.name,
      value: metric.value.toString(),
      speed:
        'connection' in navigator &&
        (navigator as any)['connection'] &&
        'effectiveType' in (navigator as any)['connection']
          ? ((navigator as any)['connection']['effectiveType'] as string)
          : '',
    }

    const blob = new Blob([new URLSearchParams(body).toString()], {
      // This content type is necessary for `sendBeacon`:
      type: 'application/x-www-form-urlencoded',
    })
    const vitalsUrl = 'https://vitals.vercel-insights.com/v1/vitals'
    // Navigator has to be bound to ensure it does not error in some browsers
    // https://xgwang.me/posts/you-may-not-know-beacon/#it-may-throw-error%2C-be-sure-to-catch
    const send = navigator.sendBeacon && navigator.sendBeacon.bind(navigator)

    function fallbackSend() {
      fetch(vitalsUrl, {
        body: blob,
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        // console.error is used here as when the fetch fails it does not affect functioning of the app
      }).catch(console.error)
    }

    try {
      // If send is undefined it'll throw as well. This reduces output code size.
      send!(vitalsUrl, blob) || fallbackSend()
    } catch (err) {
      fallbackSend()
    }
  }
}

export default async (onPerfEntry?: ReportCallback): Promise<void> => {
  // Update function if it changes:
  userReportHandler = onPerfEntry

  // Only register listeners once:
  if (isRegistered) {
    return
  }
  isRegistered = true

  for (const webVital of WEB_VITALS) {
    try {
      const m: any = config?.attributions.includes(webVital)
        ? // @ts-ignore module available at runtime, see taskfile.js
          await import('../compiled/web-vitals-attribution')
        : // @ts-ignore module available at runtime, see taskfile.js
          await import('../compiled/web-vitals')
      m[`on${webVital}`](onReport)
    } catch {
      // Do nothing if the module fails to load
    }
  }
}

export function setPerformanceRelayerConfig(
  input: PerformanceRelayerConfig
): void {
  const attributions = Array.isArray(input.attributions)
    ? input.attributions
    : []
  config = {
    attributions: attributions.filter((attr) => WEB_VITALS.includes(attr)),
  }
}
