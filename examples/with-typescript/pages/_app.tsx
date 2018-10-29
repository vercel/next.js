import React from 'react'
import App, { Container } from 'next/app'
import Head from 'next/head'

// App component is strongly typed with `@types/next`
export default class MyApp extends App {
  static async getInitialProps({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render () {
    const { Component, pageProps } = this.props
    return <Container>
      <Head>
        <title>Next.js + TypeScript Example</title>
      </Head>
      <Component {...pageProps} />
    </Container>
  }
}
