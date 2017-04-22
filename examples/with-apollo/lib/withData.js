import 'isomorphic-fetch'
import React from 'react'
import { ApolloProvider, getDataFromTree } from 'react-apollo'
import { initClient } from './initClient'

export default (Component) => (
  class extends React.Component {
    static async getInitialProps (ctx) {
      const headers = ctx.req ? ctx.req.headers : {}
      const client = initClient(headers)

      const props = {
        url: { query: ctx.query, pathname: ctx.pathname },
        ...await (Component.getInitialProps ? Component.getInitialProps(ctx) : {})
      }

      if (!process.browser) {
        const app = (
          <ApolloProvider client={client}>
            <Component {...props} />
          </ApolloProvider>
        )
        await getDataFromTree(app)
      }

      return {
        initialState: {
          apollo: {
            data: client.getInitialState().data
          }
        },
        headers,
        ...props
      }
    }

    constructor (props) {
      super(props)
      this.client = initClient(this.props.headers, this.props.initialState)
    }

    render () {
      return (
        <ApolloProvider client={this.client}>
          <Component {...this.props} />
        </ApolloProvider>
      )
    }
  }
)
