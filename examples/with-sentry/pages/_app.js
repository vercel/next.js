import App from 'next/app'
import Raven from 'raven-js'

const SENTRY_PUBLIC_DSN = ''

export default class MyApp extends App {
  constructor (...args) {
    super(...args)
    Raven.config(SENTRY_PUBLIC_DSN).install()
  }

  componentDidCatch (error, errorInfo) {
    Raven.captureException(error, { extra: errorInfo })

    // This is needed to render errors correctly in development / production
    super.componentDidCatch(error, errorInfo)
  }
}
