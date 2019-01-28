import React from 'react'

import { Provider } from 'react-redux'

import NextApp, { Container } from 'next/app'
import Head from 'next/head'

import withReduxStore from 'utils/withReduxStore'

class Srr extends NextApp {
  render () {
    const { Component, pageProps, reduxStore } = this.props
    return (
      <Container>
        <Head>
          <title>with-redux-saga-redux-form-and-reselect</title>
        </Head>
        <Provider store={reduxStore}>
          <Component pageContext={this.pageContext} {...pageProps} />
        </Provider>
      </Container>
    )
  }
}

export default withReduxStore(Srr)
