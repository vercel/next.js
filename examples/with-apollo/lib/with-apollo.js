import React from 'react'
import initApollo from './init-apollo'
import Head from 'next/head'
import { getDataFromTree } from '@apollo/react-ssr'
import { getDisplayName } from 'next-server/dist/lib/utils'
import { ApolloProvider } from '@apollo/react-hooks'

const withApollo = PageComponent => {
  return class extends React.Component {
    static displayName = `withApollo(${getDisplayName(PageComponent)})`

    static async getInitialProps (ctx) {
      const { AppTree } = ctx

      let pageProps = {}
      if (PageComponent.getInitialProps) {
        pageProps = await PageComponent.getInitialProps(ctx)
      }

      // Run all GraphQL queries in the component tree
      // and extract the resulting data
      const apolloClient = initApollo()
      if (typeof window === 'undefined') {
        try {
          // Run all GraphQL queries
          await getDataFromTree(
            <AppTree
              pageProps={{
                ...pageProps,
                apolloClient
              }}
            />
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
      const apolloState = apolloClient.cache.extract()

      return {
        ...pageProps,
        apolloState
      }
    }

    constructor (props) {
      super(props)
      this.apolloClient = props.apolloClient || initApollo(props.apolloState)
    }

    render () {
      const { apolloClient, apolloState, ...pageProps } = this.props
      return (
        <ApolloProvider client={this.apolloClient}>
          <PageComponent {...pageProps} />
        </ApolloProvider>
      )
    }
  }
}

export default withApollo
