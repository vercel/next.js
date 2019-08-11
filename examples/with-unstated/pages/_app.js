import App from 'next/app'
import React from 'react'
import { Provider } from 'unstated'
import { counterStore } from '../containers/CounterContainer'

class MyApp extends App {
  static async getInitialProps () {
    // do your server state here
    if (typeof window === 'undefined') {
      // reset state for each request
      counterStore.resetState()
      // process state, in this case counter start with 999
      counterStore.initState(999)
      return { serverState: counterStore.state }
    } else {
      return {}
    }
  }
  constructor (props) {
    super(props)
    // pass the state to client store
    // serverState will be reset when client navigate with Link
    if (typeof window !== 'undefined') {
      counterStore.initState(props.serverState.count)
    }
  }
  render () {
    const { Component, pageProps } = this.props
    return (
      <Provider inject={[counterStore]}>
        <Component {...pageProps} />
      </Provider>
    )
  }
}

export default MyApp
