import * as Sentry from '@sentry/browser'

export default async function initClient () {
  // by default `@sentry/browser` is configured with defaultIntegrations
  // which capture uncaughtExceptions and unhandledRejections
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE
  })
}
