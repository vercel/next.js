import React from 'react'
import { createOvermindSSR } from 'overmind'
import { config } from '../overmind'
import Header from '../components/Header'
import Items from '../components/Items'

class Index extends React.Component {
  static async getInitialProps () {
    // If we want to produce some mutations we do so by instantiating
    // an Overmind SSR instance, do whatever datafetching is needed and
    // change the state directly. We return the mutations performed with
    // "hydrate"
    const overmind = createOvermindSSR(config)

    overmind.state.page = 'Index'
    overmind.state.items = [
      {
        id: 0,
        title: 'foo'
      },
      {
        id: 1,
        title: 'bar'
      }
    ]

    return {
      mutations: overmind.hydrate()
    }
  }
  render () {
    return (
      <div>
        <Header />
        <Items />
      </div>
    )
  }
}

export default Index
