import * as Sentry from '@sentry/browser'

export default async function onErrorClient ({ err }) {
  Sentry.captureException(err)
}
