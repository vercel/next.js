import 'cross-fetch/polyfill'
import { GraphQLProvider } from 'graphql-react'
import { withGraphQLApp } from 'next-graphql-react'
import App, { Container } from 'next/app'

class CustomApp extends App {
  render () {
    const { Component, pageProps, graphql } = this.props
    return (
      <Container>
        <GraphQLProvider graphql={graphql}>
          <Component {...pageProps} />
        </GraphQLProvider>
      </Container>
    )
  }
}

export default withGraphQLApp(CustomApp)
