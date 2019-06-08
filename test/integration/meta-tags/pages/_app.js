import App, { Container } from 'next/app'
import Head from 'next/head'
import React from 'react'
export default class MyApp extends App {
  static async getInitialProps ({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render () {
    const { Component, pageProps } = this.props

    return (
      <Container>
        <Head>
          <meta
            id='app-viewport'
            key='ichi'
            name='viewport'
            content='width=device-width,minimum-scale=1'
          />
          <meta id='app-charSet' charSet='utf-8' />
        </Head>
        <Component {...pageProps} />
      </Container>
    )
  }
}
