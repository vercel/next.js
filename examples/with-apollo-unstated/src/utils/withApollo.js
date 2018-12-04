import { Component } from 'react'
import { initApollo } from './initApollo'
import Head from 'next/head'
import { getDataFromTree } from 'react-apollo'

export default (App) => {
  return class Apollo extends Component {
    static displayName = 'withApollo(App)'
    static async getInitialProps (ctx) {
      const { Component, router } = ctx

      let appProps = {}

      if (App.getInitialProps) {
        appProps = await App.getInitialProps(ctx)
      }

      // run all graphql queries in the component tree
      // and extract the resulting data
      const apolloClient = initApollo()
      if (!process.browser) {
        try {
          // run all graphql queries
          await getDataFromTree(
            <App
              {...appProps}
              Component={Component}
              router={router}
              apolloClient={apolloClient}
            />
          )
        } catch (error) {
          // prevent apollo client graphql errors from crashing SSR
          // handle them in component via the data.error prop
          // https://www.apollographql.com/docs/react/api/react-apollo.html#graphql-query-data-error
          console.error('Error while running `getDataFromTree`', error)
        }

        // getDataFromTree does not call componentWillUnmount
        // head side effect therefore need to be cleared manually
        Head.rewind()
      }

      // Extract query data from Apollo store
      const apolloState = apolloClient.cache.extract()

      return {
        ...appProps,
        apolloState
      }
    }
    constructor (props) {
      super(props)
      this.apolloClient = initApollo(props.apolloState)
    }
    render () {
      return <App {...this.props} apolloClient={this.apolloClient} />
    }
  }
}
