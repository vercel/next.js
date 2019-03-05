import App, { Container } from 'next/app'
import React from 'react'
import withGraphQLClient from '../lib/with-graphql-client'
import { ClientContext } from 'graphql-hooks'

class MyApp extends App {
  render () {
    const { Component, pageProps, graphQLClient } = this.props
    return (
      <Container>
        <ClientContext.Provider value={graphQLClient}>
          <Component {...pageProps} />
        </ClientContext.Provider>
      </Container>
    )
  }
}

export default withGraphQLClient(MyApp)
