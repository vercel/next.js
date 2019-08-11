import React from 'react'
import Page from '../components/Page'
import App from 'next/app'

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render () {
    const { Component, pageProps } = this.props

    return (
      <Page>
        <Component {...pageProps} />
      </Page>
    )
  }
}
