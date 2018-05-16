import App, { Container } from 'next/app'
import React from 'react'

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  state = { error: null, errorInfo: null }

  componentDidCatch (error, errorInfo) {
    this.setState({ error, errorInfo })

    // If you wish to render error with the usual error page, you can use :
    // super.componentDidCatch(error, errorInfo)
  }

  render () {
    const { Component, pageProps } = this.props

    if (this.state.errorInfo) {
      return (
        <Container>
          <div>
            <h2>Something went wrong.</h2>
            <details style={{ whiteSpace: 'pre-wrap' }}>
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo.componentStack}
            </details>
          </div>
        </Container>
      )
    }

    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}
