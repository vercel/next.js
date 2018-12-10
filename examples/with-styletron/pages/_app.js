import App, { Container } from 'next/app'
import React from 'react'
import { Provider as StyletronProvider } from 'styletron-react'
import getStyletron from '../styletron'

class MyApp extends App {
  render () {
    const { Component } = this.props
    return (
      <Container>
        <StyletronProvider value={getStyletron()}>
          <Component />
        </StyletronProvider>
      </Container>
    )
  }
}

export default MyApp
