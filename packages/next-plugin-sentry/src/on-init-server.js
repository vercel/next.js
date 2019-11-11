import * as Sentry from '@sentry/node'

export default async function initServer() {
  // by default `@sentry/node` is configured with defaultIntegrations
  // which capture uncaughtExceptions and unhandledRejections
  // see here for more https://github.com/getsentry/sentry-javascript/blob/46a02209bafcbc1603c769476ba0a1eaa450759d/packages/node/src/sdk.ts#L22
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
  })
}
