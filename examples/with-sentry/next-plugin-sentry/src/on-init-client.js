import * as Sentry from '@sentry/browser'

export default async function initClient() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  })
}
