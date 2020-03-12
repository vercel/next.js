import App from 'next/app'
import React from 'react'
import { Provider } from 'react-redux'
import withRedux from 'next-redux-wrapper'
import { initStore } from '../store'

class MyApp extends App {
  static async getStaticProps({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getStaticProps) {
      pageProps = await Component.getStaticProps(ctx)
    }

    return { pageProps }
  }

  render() {
    const { Component, pageProps, store } = this.props
    return (
      <Provider store={store}>
        <Component {...pageProps} />
      </Provider>
    )
  }
}

export default withRedux(initStore)(MyApp)
