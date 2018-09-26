import App, { Container } from 'next/app'
import Head from 'next/head'
import initApollo from '../lib/init-apollo'
import React from 'react'
import { ApolloProvider, getDataFromTree } from 'react-apollo'

export default class ConnectedApp extends App {
  static displayName = 'ApolloConnectedApp'

  static async getInitialProps (ctx) {
    const isProd = !process.env.NODE_ENV !== 'production'
    const apollo = initApollo()

    // Component here is any component being exported in the pages folder.
    const { Component, router } = ctx

    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    if (!process.browser) {
      try {
        // run all graphql queries
        await getDataFromTree(
          <ApolloProvider client={apollo}>
            <Component router={router} {...pageProps} />
          </ApolloProvider>
        )
      } catch (error) {
        !isProd && console.error('Error while running `getDataFromTree`', error)
      }

      // getDataFromTree does not call componentWillUnmount
      // head side effect therefore need to be cleared manually
      Head.rewind()
    }

    return {
      ...pageProps,
      apolloState: apollo.cache.extract(),
      router
    }
  }

  constructor (props) {
    super(props)
    this.apollo = initApollo(props.apolloState)
  }

  render () {
    const { Component, router, ...pageProps } = this.props

    // we could inject the apollo client in <Component /> by writing
    // <Component client={this.apollo} {...rest} />
    // but this example was recently updated to use the ApolloConsumer component

    return (
      <Container>
        <ApolloProvider client={this.apollo}>
          <Component router={router} {...pageProps} />
        </ApolloProvider>
      </Container>
    )
  }
}
