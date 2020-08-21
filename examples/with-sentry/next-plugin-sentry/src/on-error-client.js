import * as Sentry from '@sentry/browser'

export default async function onErrorClient({ err }) {
  if (
    !(err instanceof Error) &&
    err.name === 'Internal Server Error.' &&
    err.statusCode === 500
  ) {
    // When Next.js is rendering the error page because SSRing returned 500,
    // we'll get called with an object (instead of an Error). The server-side
    // handlers should've already captured the exception, so no need to capture
    // it again here (plus, it doesn't contain any useful information)
    return
  }

  Sentry.captureException(err)
}
