import App, { Container } from 'next/app'
import React from 'react'
import { fetchInitialStoreState, Store } from '../store'
import { Provider } from 'mobx-react'

class MyMobxApp extends App {
  state = {
    store: new Store(),
  }

  static async getInitialProps(appContext) {
    let appProps = await App.getInitialProps(appContext)

    return {
      ...appProps,
      initialStoreState: fetchInitialStoreState(),
    }
  }

  static getDerivedStateFromProps(props, state) {
    state.store.hydrate(props.initialStoreState)
    return state
  }

  render() {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Provider store={this.state.store}>
          <Component {...pageProps} />
        </Provider>
      </Container>
    )
  }
}
export default MyMobxApp
