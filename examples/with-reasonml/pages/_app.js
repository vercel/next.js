import App, { Container } from 'next/app'
import React from 'react'
import { make as CountProvider } from '../components/CountProvider.bs'

class MyApp extends App {
  static async getInitialProps({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render() {
    const { Component, pageProps, store } = this.props
    return (
      <Container>
        <CountProvider>
          <Component {...pageProps} />
        </CountProvider>
      </Container>
    )
  }
}

export default MyApp
