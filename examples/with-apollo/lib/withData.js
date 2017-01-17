import { ApolloProvider, getDataFromTree } from 'react-apollo'
import React from 'react'
import 'isomorphic-fetch'
import { IS_SERVER } from './exenv'
import { initClient } from './initClient'
import { initStore } from './initStore'

export default (Component) => (
  class extends React.Component {
    static async getInitialProps (ctx) {
      const headers = ctx.req ? ctx.req.headers : {}
      const client = initClient(headers)
      const store = initStore(client, client.initialState)

      if (IS_SERVER) {
        const app = (
          <ApolloProvider client={client} store={store}>
            <Component url={{ query: ctx.query, pathname: ctx.pathname }} />
          </ApolloProvider>
        )
        await getDataFromTree(app)
      }

      return {
        initialState: {
          apollo: {
            data: store.getState().apollo.data
          }
        },
        headers
      }
    }

    constructor (props) {
      super(props)
      this.client = initClient(this.props.headers)
      this.store = initStore(this.client, this.props.initialState)
    }

    render () {
      return (
        <ApolloProvider client={this.client} store={this.store}>
          <Component url={this.props.url} />
        </ApolloProvider>
      )
    }
  }
)
