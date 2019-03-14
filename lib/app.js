/* global next */
import React, { PureComponent } from 'react'
import { hot } from 'react-hot-loader'

class App extends PureComponent {
  state = {}

  componentDidCatch (error, info) {
    try {
      error.stack = `${error.stack}\n\n${info.componentStack}`
    } catch (err) {
      /* NOP */
    }
    next.renderError(error)
    this.setState({ hasError: true })
  }

  render () {
    if (this.state.hasError) return null

    const { Component, props, router } = this.props
    return <Component {...props} url={router} />
  }
}

export default hot(module)(App)
