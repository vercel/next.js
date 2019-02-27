import React from 'react'
import App, { Container } from 'next/app'

class MyApp extends App {
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
        <Component {...pageProps} />
        <style jsx global>{`
          body {font-family: Roboto, sans-serif; padding: 30px; color: #444;}
          h1 {margin-bottom: 5px;}
          p {font-size: 18px; line-height: 30px; margin-top: 30px;}
          .caption {color: #ccc; margin-top: 0; font-size: 14px; text-align: center;}
        `}</style>
      </Container>
    )
  }
}

export default MyApp
