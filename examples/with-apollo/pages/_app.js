import App, {Container} from 'next/app'
import React from 'react'
import PropTypes from 'prop-types'
import { ApolloProvider, getDataFromTree } from 'react-apollo'
import Head from 'next/head'
import initApollo from '../lib/initApollo'

export default class MyApp extends App {
  static childContextTypes = {
    ...App.childContextTypes,
    apollo: PropTypes.object
  }

  getChildContext () {
    return {
      ...super.getChildContext(),
      apollo: this.apollo
    }
  }

  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    const serverState = {
      apollo: {}
    }

    // Run all GraphQL queries in the component tree
    // and extract the resulting data
    const apollo = initApollo()
    try {
      // Run all GraphQL queries
      await getDataFromTree(
        <MyApp Component={Component} router={router} pageProps={pageProps} serverState={serverState} />
      )
    } catch (error) {
      // Prevent Apollo Client GraphQL errors from crashing SSR.
      // Handle them in components via the data.error prop:
      // http://dev.apollodata.com/react/api-queries.html#graphql-query-data-error
      console.error('Error while running `getDataFromTree`', error)
    }

    if (!process.browser) {
      // getDataFromTree does not call componentWillUnmount
      // head side effect therefore need to be cleared manually
      Head.rewind()
    }

    // Extract query data from the Apollo store
    serverState.apollo.data = apollo.cache.extract()

    return {
      pageProps,
      serverState
    }
  }

  constructor (props) {
    super(props)
    this.apollo = initApollo(props.serverState.apollo.data)
  }

  render () {
    const {Component, pageProps} = this.props
    return <Container>
      <ApolloProvider client={this.apollo}>
        <Component {...pageProps} />
      </ApolloProvider>
    </Container>
  }
}
