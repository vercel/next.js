import React from 'react'
import { QueryRenderer, fetchQuery } from 'react-relay'
import NextApp from 'next/app'

import { initEnvironment, createEnvironment } from '../lib/createEnvironment'

import { RecordSource, Store } from 'relay-runtime'

export default class App extends NextApp {
  static getInitialProps = async ({ Component, router, ctx }) => {
    let store

    if (ctx.req) {
      const source = new RecordSource()
      store = new Store(source)
    }

    const { variables } = Component.getInitialProps
      ? await Component.getInitialProps(ctx)
      : {}

    try {
      if (initEnvironment && Component.query) {
        const { environment, relaySSR } = initEnvironment(store)

        await fetchQuery(environment, Component.query, variables)

        return {
          variables,
          relayData: await relaySSR.getCache(),
          store,
        }
      }
    } catch (e) {
      console.log(e)
    }

    return {
      variables,
      store,
    }
  }

  render() {
    const { Component, variables = {}, relayData, store } = this.props
    const environment = createEnvironment(
      relayData,
      JSON.stringify({
        queryID: Component.query ? Component.query.params.name : undefined,
        variables,
      }),
      store
    )

    return (
      <QueryRenderer
        environment={environment}
        query={Component.query}
        variables={variables}
        render={({ error, props }) => {
          if (error) return <div>{error.message}</div>
          else if (props) return <Component {...props} />
          return <div>Loading</div>
        }}
      />
    )
  }
}
