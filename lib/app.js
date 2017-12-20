import React, { Component } from 'react'
import PropTypes from 'prop-types'
import shallowEquals from './shallow-equals'
import { warn } from './utils'
import { makePublicRouterInstance } from './router'

export default class App extends Component {
  state = {
    hasError: null
  }

  static childContextTypes = {
    headManager: PropTypes.object,
    router: PropTypes.object
  }

  getChildContext () {
    const { headManager } = this.props
    return {
      headManager,
      router: makePublicRouterInstance(this.props.router)
    }
  }

  componentDidCatch (error, info) {
    error.stack = `${error.stack}\n\n${info.componentStack}`
    window.next.renderError(error)
    this.setState({ hasError: true })
  }

  render () {
    if (this.state.hasError) return null

    const { Component, props, hash, router } = this.props
    const url = createUrl(router)
    // If there no component exported we can't proceed.
    // We'll tackle that here.
    if (typeof Component !== 'function') {
      throw new Error(`The default export is not a React Component in page: "${url.pathname}"`)
    }
    const containerProps = { Component, props, hash, router, url }

    return <Container {...containerProps} />
  }
}

class Container extends Component {
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

  shouldComponentUpdate (nextProps) {
    // need this check not to rerender component which has already thrown an error
    return !shallowEquals(this.props, nextProps)
  }

  render () {
    const { Component, props, url } = this.props
    const page = (typeof Component.renderPage === 'function') ? (
      Component.renderPage(this.props)
    ) : (
      <Component {...props} url={url} />
    )

    if (process.env.NODE_ENV === 'production') {
      return page
    } else {
      const ErrorDebug = require('./error-debug').default
      const { AppContainer } = require('react-hot-loader')

      // includes AppContainer which bypasses shouldComponentUpdate method
      // https://github.com/gaearon/react-hot-loader/issues/442
      return (
        <AppContainer warnings={false} errorReporter={ErrorDebug}>
          {page}
        </AppContainer>
      )
    }
  }
}

function createUrl (router) {
  return {
    query: router.query,
    pathname: router.pathname,
    asPath: router.asPath,
    back: () => {
      warn(`Warning: 'url.back()' is deprecated. Use "window.history.back()"`)
      router.back()
    },
    push: (url, as) => {
      warn(`Warning: 'url.push()' is deprecated. Use "next/router" APIs.`)
      return router.push(url, as)
    },
    pushTo: (href, as) => {
      warn(`Warning: 'url.pushTo()' is deprecated. Use "next/router" APIs.`)
      const pushRoute = as ? href : null
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url, as) => {
      warn(`Warning: 'url.replace()' is deprecated. Use "next/router" APIs.`)
      return router.replace(url, as)
    },
    replaceTo: (href, as) => {
      warn(`Warning: 'url.replaceTo()' is deprecated. Use "next/router" APIs.`)
      const replaceRoute = as ? href : null
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    }
  }
}
