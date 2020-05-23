import { QueryRenderer, fetchQuery } from 'react-relay'
import NextApp from 'next/app'

import { initEnvironment, createEnvironment } from '../lib/createEnvironment'

export default class App extends NextApp {
  static getInitialProps = async ({ Component, router, ctx }) => {
    const { variables } = Component.getInitialProps
      ? await Component.getInitialProps(ctx)
      : {}

    try {
      if (initEnvironment && Component.query) {
        const { environment } = initEnvironment()

        await fetchQuery(environment, Component.query, variables)

        const records = environment.getStore().getSource().toJSON()

        return {
          variables,
          records,
        }
      }
    } catch (e) {
      console.log(e)
    }

    return {
      variables,
    }
  }

  render() {
    const { Component, variables = {}, records } = this.props
    const environment = createEnvironment(records)

    return (
      <QueryRenderer
        fetchPolicy="store-and-network"
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
