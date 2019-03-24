import React from 'react'
import Header from '../components/Header'
import { createOvermindSSR } from 'overmind'
import { config } from '../overmind'

class Index extends React.Component {
  static async getInitialProps () {
    // If we want to produce some mutations we do so by instantiating
    // an Overmind SSR instance, do whatever datafetching is needed and
    // change the state directly. We return the mutations performed with
    // "hydrate"
    const overmind = createOvermindSSR(config)

    overmind.state.page = 'About'

    return {
      mutations: overmind.hydrate()
    }
  }
  render () {
    return (
      <div>
        <Header />
      </div>
    )
  }
}

export default Index
