import React from 'react'
import App, {Container} from 'next/app'

import DefaultLayout from '../layouts/BlueLayout'

export default class MyApp extends App {
  render () {
    const {Component, pageProps} = this.props
    const Layout = Component.Layout || DefaultLayout

    return (
      <Container>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </Container>
    )
  }
}
