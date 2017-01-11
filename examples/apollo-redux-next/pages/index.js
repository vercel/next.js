import React from 'react'
import ApolloClient, { createNetworkInterface } from 'apollo-client'
import { ApolloProvider } from 'react-apollo'
import { Provider } from 'react-redux'
import { initStore } from '../store'
import Home from '../containers/home'

const client = new ApolloClient({
  networkInterface: createNetworkInterface({ uri: 'https://foodtruckserver.now.sh/graphql' })
})

/**
 * Component to show the home container.
 */
export default class App extends React.Component {
  static getInitialProps ({ req }) {
    const isServer = !!req
    const store = initStore({}, isServer)
    return { initialState: store.getState(), isServer }
  }

  constructor (props) {
    super(props)
    this.store = initStore(props.initialState, props.isServer)
  }

  render () {
    return (
      <ApolloProvider client={client}>
        <Provider store={this.store}>
          <Home />
        </Provider>
      </ApolloProvider>
    )
  }
}
