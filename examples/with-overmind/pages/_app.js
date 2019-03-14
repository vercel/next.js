import React from 'react'
import App, { Container } from 'next/app'
import { createOvermind, createOvermindSSR, rehydrate } from 'overmind'
import { Provider } from 'overmind-react'
import { config } from '../overmind'

class MyApp extends App {
  // From the documentation of Next
  // CLIENT: After initial route, on page change
  // SERVER: On initial route
  static async getInitialProps ({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }
  // CLIENT: On initial route
  // SERVER: On initial route
  constructor (props) {
    super(props)

    const mutations = props.pageProps.mutations || []

    if (process.browser) {
      // On the client we just instantiate the Overmind instance and run
      // the "changePage" action
      this.overmind = createOvermind(config)
      this.overmind.actions.changePage(mutations)
    } else {
      // On the server we rehydrate the mutations to an SSR instance of Overmind,
      // as we do not want to run any additional logic here
      this.overmind = createOvermindSSR(config)
      rehydrate(this.overmind.state, mutations)
    }
  }
  // CLIENT: After initial route, on page change
  // SERVER: never
  componentDidUpdate () {
    // This runs whenever the client routes to a new page
    this.overmind.actions.changePage(this.props.pageProps.mutations || [])
  }
  // CLIENT: On every page change
  // SERVER: On initial route
  render () {
    const { Component } = this.props

    return (
      <Container>
        <Provider value={this.overmind}>
          <Component />
        </Provider>
      </Container>
    )
  }
}

export default MyApp
