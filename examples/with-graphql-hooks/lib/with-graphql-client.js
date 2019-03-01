import React from 'react'
import initGraphQL from './init-graphql'
import Head from 'next/head'
import { getInitialState } from 'graphql-hooks-ssr'

export default App => {
  return class GraphQLHooks extends React.Component {
    static displayName = 'GraphQLHooks(App)'
    static async getInitialProps (ctx) {
      const { Component, router } = ctx

      let appProps = {}
      if (App.getInitialProps) {
        appProps = await App.getInitialProps(ctx)
      }

      // Run all GraphQL queries in the component tree
      // and extract the resulting data
      const graphQLClient = initGraphQL()
      let graphQLState = {}
      if (!process.browser) {
        try {
          // Run all GraphQL queries
          graphQLState = await getInitialState({
            App: (
              <App
                {...appProps}
                Component={Component}
                router={router}
                graphQLClient={graphQLClient}
              />
            ),
            client: graphQLClient
          })
        } catch (error) {
          // Prevent GraphQL hooks client errors from crashing SSR.
          // Handle them in components via the state.error prop:
          // https://github.com/nearform/graphql-hooks#usequery
          console.error('Error while running `getInitialState`', error)
        }

        // getInitialState does not call componentWillUnmount
        // head side effect therefore need to be cleared manually
        Head.rewind()
      }

      return {
        ...appProps,
        graphQLState
      }
    }

    constructor (props) {
      super(props)
      this.graphQLClient = initGraphQL(props.graphQLState)
    }

    render () {
      return <App {...this.props} graphQLClient={this.graphQLClient} />
    }
  }
}
