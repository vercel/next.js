import React from 'react'
import { Provider } from 'react-redux'
import App from 'next/app'
import withReduxStore from '../lib/with-redux-store'

class MyApp extends App {
  render() {
    const { Component, pageProps, store } = this.props
    return (
      <Provider store={store}>
        <Component {...pageProps} />
      </Provider>
    )
  }
}

export default withReduxStore(MyApp)
