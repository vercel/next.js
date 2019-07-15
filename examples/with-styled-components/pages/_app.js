import App, { Container } from 'next/app'
import React from 'react'
import { ThemeProvider } from 'styled-components'

const theme = {
  colors: {
    primary: '#0070f3'
  }
}

export default class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <ThemeProvider theme={theme}>
          <Component {...pageProps} />
        </ThemeProvider>
      </Container>
    )
  }
}
