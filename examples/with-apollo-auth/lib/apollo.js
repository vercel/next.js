import React from 'react'
import cookie from 'cookie'
import PropTypes from 'prop-types'
import { getDataFromTree } from '@apollo/react-ssr'
import Head from 'next/head'
import { ApolloClient, InMemoryCache, HttpLink } from 'apollo-boost'
import { setContext } from 'apollo-link-context'
import fetch from 'isomorphic-unfetch'

function parseCookies (req, options = {}) {
  return cookie.parse(req ? req.headers.cookie || '' : document.cookie, options)
}

export default App => {
  return class WithData extends React.Component {
    // It is needed for better devtools experience. Check how react devtools shows it: "MyApp WithData"
    static displayName = `WithData(${App.displayName})`

    // Since apolloState is required but it is missed before this method returns the new props,
    // so it is needed to provide defaults
    static defaultProps = {
      apolloState: {}
    }

    static propTypes = {
      apolloState: PropTypes.object.isRequired
    }

    static async getInitialProps (ctx) {
      const {
        AppTree,
        ctx: { req, res }
      } = ctx
      const apollo = initApolloClient(
        {},
        {
          getToken: () => parseCookies(req).token
        }
      )

      ctx.ctx.apolloClient = apollo

      let appProps = {}
      if (App.getInitialProps) {
        appProps = await App.getInitialProps(ctx)
      }

      if (res && res.finished) {
        // When redirecting, the response is finished.
        // No point in continuing to render
        return {}
      }

      if (typeof window === 'undefined') {
        // Run all graphql queries in the component tree
        // and extract the resulting data
        try {
          // Run all GraphQL queries
          await getDataFromTree(<AppTree {...appProps} apolloClient={apollo} />)
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

      // Extract query data from the Apollo's store
      const apolloState = apollo.cache.extract()

      return {
        ...appProps,
        apolloState
      }
    }

    constructor (props) {
      super(props)
      // `getDataFromTree` renders the component first, the client is passed off as a property.
      // After that rendering is done using Next's normal rendering pipeline
      this.apolloClient = initApolloClient(props.apolloState, {
        getToken: () => {
          return parseCookies().token
        }
      })
    }

    render () {
      return <App apolloClient={this.apolloClient} {...this.props} />
    }
  }
}

let apolloClient = null

/**
 * Always creates a new apollo client on the server
 * Creates or reuses apollo client in the browser.
 */
function initApolloClient (...args) {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (typeof window === 'undefined') {
    return createApolloClient(...args)
  }

  // Reuse client on the client-side
  if (!apolloClient) {
    apolloClient = createApolloClient(...args)
  }

  return apolloClient
}

/**
 * Creates and configures the ApolloClient
 * @param  {Object} [initialState={}]
 */
function createApolloClient (initialState = {}, { getToken }) {
  const fetchOptions = {}

  // If you are using a https_proxy, add fetchOptions with 'https-proxy-agent' agent instance
  // 'https-proxy-agent' is required here because it's a sever-side only module
  if (typeof window === 'undefined') {
    if (process.env.https_proxy) {
      fetchOptions.agent = new (require('https-proxy-agent'))(
        process.env.https_proxy
      )
    }
  }

  const httpLink = new HttpLink({
    uri: 'https://api.graph.cool/simple/v1/cj5geu3slxl7t0127y8sity9r', // Server URL (must be absolute)
    credentials: 'same-origin',
    fetch,
    fetchOptions
  })

  const authLink = setContext((_, { headers }) => {
    const token = getToken()
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : ''
      }
    }
  })

  // Check out https://github.com/zeit/next.js/pull/4611 if you want to use the AWSAppSyncClient
  const isBrowser = typeof window !== 'undefined'
  return new ApolloClient({
    connectToDevTools: isBrowser,
    ssrMode: !isBrowser, // Disables forceFetch on the server (so queries are only run once)
    link: authLink.concat(httpLink),
    cache: new InMemoryCache().restore(initialState)
  })
}
