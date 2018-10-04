import { InMemoryCache } from 'apollo-cache-inmemory'
import { ApolloClient } from 'apollo-client'
import { setContext } from 'apollo-link-context'
import { createHttpLink } from 'apollo-link-http'
import isomorphicFetch from 'isomorphic-fetch'
import React from 'react'
import { ApolloProvider } from 'react-apollo'
import App, { Container } from 'next/app'

const httpLink = createHttpLink({ uri: 'https://graphql.myshopify.com/api/graphql' , fetch: isomorphicFetch })

const middlewareLink = setContext(() => ({
  headers: {
    'X-Shopify-Storefront-Access-Token': 'dd4d4dc146542ba7763305d71d1b3d38'
  }
}))

const isServer = (typeof window === "undefined")
let _client = null

export default class MyApp extends App {
  constructor (props) {
    super(props)
    if (_client === null || isServer) {
      _client = new ApolloClient({
        link: middlewareLink.concat(httpLink),
        cache: new InMemoryCache(),
      })
    }
    this.client = _client
  }

  render () {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <ApolloProvider client={this.client}>
          <Component {...pageProps} />
        </ApolloProvider>
      </Container>
    )
  }
}
