import React from 'react'
import App, { Container } from 'next/app'
import Helmet from 'react-helmet'

export default class MyApp extends App {
  static async getInitialProps (...args) {
    return App.getInitialProps(...args)
  }

  render () {
    const { Component, pageProps } = this.props

    return (
      <Container>
        <Helmet
          htmlAttributes={{ lang: 'en' }}
          title='Hello next.js!'
          meta={[
            {
              name: 'viewport',
              content: 'width=device-width, initial-scale=1'
            },
            { property: 'og:title', content: 'Hello next.js!' }
          ]}
        />
        <Component {...pageProps} />
      </Container>
    )
  }
}
