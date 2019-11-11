import * as Sentry from '@sentry/node'

export default async function onErrorServer({ err }) {
  Sentry.captureException(err)
}
