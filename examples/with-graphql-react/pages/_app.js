import 'cross-fetch/polyfill'
import { Provider } from 'graphql-react'
import { withGraphQL } from 'next-graphql-react'
import App, { Container } from 'next/app'

class CustomApp extends App {
  render () {
    const { Component, pageProps, graphql } = this.props
    return (
      <Container>
        <Provider value={graphql}>
          <Component {...pageProps} />
        </Provider>
      </Container>
    )
  }
}

export default withGraphQL(CustomApp)
