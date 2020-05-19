import React from 'react'
import App from 'next/app'
import * as Sentry from '@sentry/node'

Sentry.init({
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.SENTRY_DSN,
})

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props

    // Workaround for https://github.com/zeit/next.js/issues/8592
    const { err } = this.props
    const modifiedPageProps = { ...pageProps, err }

    return <Component {...modifiedPageProps} />
  }
}

export default MyApp
