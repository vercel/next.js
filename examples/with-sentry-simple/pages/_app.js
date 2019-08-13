import React from 'react'
import App from 'next/app'
import * as Sentry from '@sentry/browser'

Sentry.init({
  dsn: 'ENTER_YOUR_SENTRY_DSN_HERE'
})

class MyApp extends App {
  componentDidCatch (error, errorInfo) {
    Sentry.withScope(scope => {
      Object.keys(errorInfo).forEach(key => {
        scope.setExtra(key, errorInfo[key])
      })

      Sentry.captureException(error)
    })

    super.componentDidCatch(error, errorInfo)
  }

  render () {
    const { Component, pageProps } = this.props

    return <Component {...pageProps} />
  }
}

export default MyApp
