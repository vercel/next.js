import App, { Container } from 'next/app'
import React from 'react'
import { Provider } from 'unstated'
import { counterStore } from '../containers/CounterContainer'


class MyApp extends App {
  static async getInitialProps () {
    // do your server state here
    if (!process.browser) {
      // reset state
      counterStore.resetState()
      // process state
      counterStore.initState(999)
      return { serverState : counterStore.state }
    } else {
      return {}
    }
  }
  constructor(props) {
    super(props)
    // pass the state to client store
    // serverState will reset when client navigate with Link
    if (process.browser) {
      counterStore.initState(props.serverState.count)
    }
  }
  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Provider inject={[counterStore]}>
          <Component {...pageProps} />
        </Provider>
      </Container>
    )
  }
}

export default MyApp
