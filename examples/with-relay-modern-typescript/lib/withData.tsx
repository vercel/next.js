import React from 'react'
import { NextPage, NextPageContext } from 'next'
import { fetchQuery, ReactRelayContext } from 'react-relay'
import { Environment, GraphQLTaggedNode } from 'relay-runtime'
import initEnvironment from './createRelayEnvironment'

export default (
  ComposedComponent: NextPage,
  options: { query?: GraphQLTaggedNode } = {}
) => {
  return class WithData extends React.Component {
    static displayName = `WithData(${ComposedComponent.displayName})`
    environment: Environment

    static async getInitialProps(ctx: NextPageContext) {
      // Evaluate the composed component's getInitialProps()
      let composedInitialProps = {}
      if (ComposedComponent.getInitialProps) {
        composedInitialProps = await ComposedComponent.getInitialProps(ctx)
      }

      let queryProps = {}
      let queryRecords = {}
      const environment = initEnvironment()

      if (options.query) {
        // Provide the `url` prop data in case a graphql query uses it
        // const url = { query: ctx.query, pathname: ctx.pathname }
        const variables = {}
        // TODO: Consider RelayQueryResponseCache
        // https://github.com/facebook/relay/issues/1687#issuecomment-302931855
        queryProps = (await fetchQuery(
          environment,
          options.query,
          variables
        )) as any
        queryRecords = environment
          .getStore()
          .getSource()
          .toJSON()
      }

      return {
        ...composedInitialProps,
        ...queryProps,
        queryRecords,
      }
    }

    constructor(props: any) {
      super(props)
      this.environment = initEnvironment({
        records: props.queryRecords,
      })
    }

    render() {
      return (
        <ReactRelayContext.Provider value={{ environment: this.environment }}>
          <ComposedComponent {...this.props} />
        </ReactRelayContext.Provider>
      )
    }
  }
}
