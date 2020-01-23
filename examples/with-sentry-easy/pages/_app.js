import React from 'react'
import App from 'next/app'
import Head from 'next/head'
import * as Sentry from '@sentry/node'

Sentry.init({
  // Replace with your project's Sentry DSN
  dsn: process.env.SENTRY_DSN,
})

class MyApp extends App {
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}
    try {
      if (Component.getInitialProps) {
        pageProps = await Component.getInitialProps({ ctx })
      }
      return { pageProps }
    } catch (err) {
      // This will work on both client and server sides.
      console.log(
        'The Error happened in: ',
        typeof window === 'undefined' ? 'Server' : 'Client'
      )
      Sentry.captureException(err)
      return { pageProps }
    }
  }

  render() {
    const { Component, pageProps, err } = this.props
    // Pass err to component
    const modifiedPageProps = { ...pageProps, err }
    return (
      <>
        <style jsx global>{`
          * {
            margin: 0;
            padding: 0;
          }
          html,
          body {
            background: #e2e3e4;
          }
        `}</style>
        <Head>
          <title>🐞Next-Sentry-Ease-Demo</title>
        </Head>
        <Component {...modifiedPageProps} />
      </>
    )
  }
}

export default MyApp
