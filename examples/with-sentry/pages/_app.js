import App from 'next/app'
import * as Sentry from '@sentry/browser'

const SENTRY_PUBLIC_DSN = ''

export default class MyApp extends App {
  constructor (...args) {
    super(...args)
    Sentry.init({ dsn: SENTRY_PUBLIC_DSN })
  }

  componentDidCatch (error, errorInfo) {
    Sentry.configureScope(scope => {
      Object.keys(errorInfo).forEach(key => {
        scope.setExtra(key, errorInfo[key])
      })
    })
    Sentry.captureException(error)

    // This is needed to render errors correctly in development / production
    super.componentDidCatch(error, errorInfo)
  }
}
