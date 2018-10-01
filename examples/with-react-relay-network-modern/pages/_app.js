import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { QueryRenderer } from 'react-relay'
import NextApp, { Container } from 'next/app'

import {
  environment,
  createEnvironment,
  relaySSR
} from '../lib/createEnvironment'

export default class App extends NextApp {
  static getInitialProps = async ({ Component, router, ctx }) => {
    const { variables } = Component.getInitialProps ? await Component.getInitialProps(ctx) : {}

    if (environment) {
      ReactDOMServer.renderToString(
        <QueryRenderer
          environment={environment}
          query={Component.query}
          variables={variables}
          render={() => null}
        />
      )
    }

    return {
      variables,
      relayData: relaySSR ? await relaySSR.getCache() : undefined
    }
  };

  render () {
    const { Component, variables = {}, relayData } = this.props

    return (
      <Container>
        <QueryRenderer
          environment={createEnvironment(relayData)}
          query={Component.query}
          variables={variables}
          render={({ error, props }) => {
            if (error) return <div>{error.message}</div>
            else if (props) return <Component {...props} />
            return <div>Loading</div>
          }}
        />
      </Container>
    )
  }
}
