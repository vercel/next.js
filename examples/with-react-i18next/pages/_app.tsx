import App, { Container } from 'next/app'
import React from 'react'

import withI18n from '../i18n/hoc'

class MyApp extends App {
  public render() {
    const { Component, pageProps } = this.props

    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}

export default withI18n(MyApp)
