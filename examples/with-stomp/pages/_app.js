import App from 'next/app'
import React from 'react'
import { Stomp } from '@stomp/stompjs'

class MyApp extends App {
  static async getInitialProps ({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  state = {
    stompClient: null
  }

  componentDidMount () {
    // connect to Websocket only once.
    const client = Stomp.client('ws://some.stomp.server')
    client.connect({}, () => {
      this.setState({ stompClient: client })
    })
  }

  // close socket connection
  componentWillUnmount () {
    this.state.stompClient.disconnect()
  }

  render () {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} stompClient={this.state.stompClient} />
  }
}

export default MyApp