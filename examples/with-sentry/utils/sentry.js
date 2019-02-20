// NOTE: This require will be replaced with `@sentry/browser` when
// process.browser === true thanks to the webpack config in next.config.js
const Sentry = require('@sentry/node')
const Cookie = require('js-cookie')

module.exports = ({ release }) => {
  const sentryOptions = {
    dsn: process.env.SENTRY_DSN,
    release,
    maxBreadcrumbs: 50,
    attachStacktrace: true
  }

  // When we're developing locally
  if (process.env.NODE_ENV !== 'production') {
    /* eslint-disable-next-line global-require */
    const sentryTestkit = require('sentry-testkit')
    const { sentryTransport } = sentryTestkit()

    // Don't actually send the errors to Sentry
    sentryOptions.transport = sentryTransport

    // Instead, dump the errors to the console
    sentryOptions.integrations = [new Sentry.Integrations.Debug({
      // Trigger DevTools debugger instead of using console.log
      debugger: false
    })]
  }

  Sentry.init(sentryOptions)

  return {
    Sentry,
    captureException: (err, { req, res, errorInfo, query, pathname }) => {
      Sentry.configureScope((scope) => {
        if (err.message) {
          // De-duplication currently doesn't work correctly for SSR / browser errors
          // so we force deduplication by error message if it is present
          scope.setFingerprint([err.message])
        }

        if (err.statusCode) {
          scope.setExtra('statusCode', err.statusCode)
        }

        if (res && res.statusCode) {
          scope.setExtra('statusCode', res.statusCode)
        }

        if (process.browser) {
          scope.setTag('ssr', false)
          scope.setExtra('query', query)
          scope.setExtra('pathname', pathname)

          // On client-side we use js-cookie package to fetch it
          const sessionId = Cookie.get('sid')
          if (sessionId) {
            scope.setUser({ id: sessionId })
          }
        } else {
          scope.setTag('ssr', true)
          scope.setExtra('url', req.url)
          scope.setExtra('method', req.method)
          scope.setExtra('headers', req.headers)
          scope.setExtra('params', req.params)
          scope.setExtra('query', req.query)

          // On server-side we take session cookie directly from request
          if (req.cookies.sid) {
            scope.setUser({ id: req.cookies.sid })
          }
        }

        if (errorInfo) {
          Object.keys(errorInfo).forEach(key => scope.setExtra(key, errorInfo[key]))
        }
      })

      return Sentry.captureException(err)
    }
  }
}
