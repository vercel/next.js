const Sentry = require('@sentry/node')
const Cookie = require('js-cookie')

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    maxBreadcrumbs: 50,
    attachStacktrace: true
  })
}

function captureException (err, { req, res, errorInfo, query, pathname }) {
  Sentry.configureScope(scope => {
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
      scope.setExtra('componentStack', errorInfo.componentStack)
    }
  })

  Sentry.captureException(err)
}

module.exports = {
  captureException
}
