import App, { Container } from 'next/app'
import React from 'react'
import FelaProvider from '../FelaProvider'

export default class MyApp extends App {
  static async getInitialProps ({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render () {
    const { Component, pageProps, renderer } = this.props
    return (
      <Container>
        <FelaProvider renderer={renderer}>
          <Component {...pageProps} />
        </FelaProvider>
      </Container>
    )
  }
}
