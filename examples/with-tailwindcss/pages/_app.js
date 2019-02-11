import '../styles/index.css'

import React from 'react'
import App, { Container } from 'next/app'

export default class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props

    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}
