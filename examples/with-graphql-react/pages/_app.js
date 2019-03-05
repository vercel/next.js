import 'cross-fetch/polyfill'
import { GraphQLContext } from 'graphql-react'
import { withGraphQLApp } from 'next-graphql-react'
import App, { Container } from 'next/app'

class CustomApp extends App {
  render () {
    const { Component, pageProps, graphql } = this.props
    return (
      <Container>
        <GraphQLContext.Provider value={graphql}>
          <Component {...pageProps} />
        </GraphQLContext.Provider>
      </Container>
    )
  }
}

export default withGraphQLApp(CustomApp)
