import React from 'react'
import initApollo from './init-apollo'
import Head from 'next/head'
import { getDataFromTree } from '@apollo/react-ssr'
import { ApolloProvider } from '@apollo/react-hooks'

export default App => {
  return class Apollo extends React.Component {
    static displayName = 'withApollo(App)'
    static async getInitialProps (ctx) {
      const { AppTree } = ctx

      let appProps = {}
      // Run all GraphQL queries in the component tree
      // and extract the resulting data
      const client = initApollo()

      if (App.getInitialProps) {
        ctx.client = client
        appProps = await App.getInitialProps(ctx)
      }

      if (typeof window === 'undefined') {
        try {
          // Run all GraphQL queries
          await getDataFromTree(
            <ApolloProvider client={client}>
              <AppTree {...appProps} />
            </ApolloProvider>
          )
        } catch (error) {
          // Prevent Apollo Client GraphQL errors from crashing SSR.
          // Handle them in components via the data.error prop:
          // https://www.apollographql.com/docs/react/api/react-apollo.html#graphql-query-data-error
          console.error('Error while running `getDataFromTree`', error)
        }

        // getDataFromTree does not call componentWillUnmount
        // head side effect therefore need to be cleared manually
        Head.rewind()
      }

      // Extract query data from the Apollo store
      const apolloState = client.cache.extract()

      return {
        ...appProps,
        apolloState
      }
    }

    client = initApollo(this.props.apolloState)

    render () {
      return (
        <ApolloProvider client={this.client}>
          <App {...this.props} />
        </ApolloProvider>
      )
    }
  }
}
