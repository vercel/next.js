import App, {Container} from 'next/app'
import React from 'react'
import {setState} from '../shared-module'

setState(typeof window === 'undefined' ? 'UPDATED' : 'UPDATED CLIENT')

class Layout extends React.Component {
  state = {
    random: false
  }

  componentDidMount () {
    this.setState({random: Math.random()})
  }

  render () {
    const {children} = this.props
    const {random} = this.state
    return <div>
      <p id='hello-app'>Hello App</p>
      <p id='hello-hmr'>Hello HMR</p>
      <p id='random-number'>{random}</p>
      {children}
    </div>
  }
}

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props
    return <Container>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </Container>
  }
}
