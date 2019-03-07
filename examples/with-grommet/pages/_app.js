import React from 'react'
import App, { Container } from 'next/app'
import { Grommet, grommet as grommetTheme } from 'grommet'

export default class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Grommet theme={grommetTheme}>
          <Component {...pageProps} />
        </Grommet>
      </Container>
    )
  }
}
