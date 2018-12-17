import App, { Container } from 'next/app'
import React from 'react'
import { Provider } from 'unstated'
import { CounterContainer } from '../containers'

const counter = new CounterContainer()

class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Provider inject={[counter]}>
          <Component {...pageProps} />
        </Provider>
      </Container>
    )
  }
}

export default MyApp
