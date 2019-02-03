/* global next */
import React, { Component, PureComponent } from 'react'
import { hot } from 'react-hot-loader'

class App extends Component {
  state = {
    hasError: null
  }

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

    const { Component, props, hash, router = {} } = this.props
    const url = {
      query: router.query,
      pathname: router.pathname,
      asPath: router.asPath
    }

    const containerProps = { Component, props, hash, url }

    return <div>
      <Container {...containerProps} />
    </div>
  }
}

class Container extends PureComponent {
  componentDidMount () {
    this.scrollToHash()
  }

  componentDidUpdate () {
    this.scrollToHash()
  }

  scrollToHash () {
    const { hash } = this.props
    if (!hash) return

    const el = document.getElementById(hash)
    if (!el) return

    // If we call scrollIntoView() in here without a setTimeout
    // it won't scroll properly.
    setTimeout(() => el.scrollIntoView(), 0)
  }

  render () {
    const { Component, props, url } = this.props
    return <Component {...props} url={url} />
  }
}

export default hot(module)(App)
