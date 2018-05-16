import React from 'react'
import App, { Container } from 'next/app'
import { ApolloProvider } from 'react-apollo'
import withApolloClient from '../lib/withApolloClient'
import checkLoggedIn from '../lib/checkLoggedIn'

class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }, apolloClient) {
    let pageProps = {}
    const { loggedInUser } = await checkLoggedIn(ctx, apolloClient)

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx, loggedInUser)
    }

    return { pageProps, loggedInUser }
  }

  render () {
    const { Component, pageProps, apolloClient, loggedInUser } = this.props

    return (
      <Container>
        <ApolloProvider client={apolloClient}>
          <Component {...pageProps} loggedInUser={loggedInUser} />
        </ApolloProvider>
      </Container>
    )
  }
}

export default withApolloClient(MyApp)
