import App from 'next/app'
import React from 'react'
import { ApolloProvider } from '@apollo/react-hooks'
import withApollo from '../lib/withApollo'

class MyApp extends App {
  static displayName = 'MyApp'

  render () {
    const { Component, pageProps, apolloClient } = this.props
    return (
      <ApolloProvider client={apolloClient}>
        <Component {...pageProps} />
      </ApolloProvider>
    )
  }
}

export default withApollo(MyApp)
