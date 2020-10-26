import { withScope, captureException } from '@sentry/browser'

export default async function onErrorClient({ err, errorInfo }) {
  withScope((scope) => {
    if (typeof errorInfo?.componentStack === 'string') {
      scope.setContext('react', {
        componentStack: errorInfo.componentStack.trim(),
      })
    }
    captureException(err)
  })
}
