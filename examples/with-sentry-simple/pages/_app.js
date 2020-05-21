import * as Sentry from '@sentry/node'

Sentry.init({
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
})

export default function App({ Component, pageProps, err }) {
  // Workaround for https://github.com/zeit/next.js/issues/8592
  return <Component {...pageProps} err={err} />
}
