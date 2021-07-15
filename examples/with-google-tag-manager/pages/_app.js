import * as gtm from '../lib/gtm'

export function reportWebVitals(metric) {
  switch (metric.name) {
    case 'Next.js-hydration':
      // register right after hydration
      return gtm.pageview(window.location.href)
    case 'Next.js-route-change-to-render':
      // register pageviews after client-side transitions
      return gtm.pageview(window.location.href)
    default:
  }
}

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
