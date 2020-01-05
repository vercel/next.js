import App from 'next/app'
import React from 'react'
import withGraphQLClient from '../lib/with-graphql-client'
import { ClientContext } from 'graphql-hooks'

class MyApp extends App {
  render() {
    const { Component, pageProps, graphQLClient } = this.props
    return (
      <ClientContext.Provider value={graphQLClient}>
        <Component {...pageProps} />
      </ClientContext.Provider>
    )
  }
}

export default withGraphQLClient(MyApp)
