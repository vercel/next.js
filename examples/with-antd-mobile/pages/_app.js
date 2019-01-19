import React from 'react'
import App, { Container } from 'next/app'
import Head from 'next/head'

export default class CustomApp extends App {
  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Head>
          <meta
            name='viewport'
            content='width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no'
          />
          <style global jsx>{`
            html,
            body {
              font-family: 'Helvetica Neue', 'Hiragino Sans GB', Helvetica,
                'Microsoft YaHei', Arial;
              margin: 0;
            }
          `}</style>
        </Head>
        <Component {...pageProps} />
      </Container>
    )
  }
}
