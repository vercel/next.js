import React, { Component } from 'react'
import PropTypes from 'prop-types'
import shallowEquals from './shallow-equals'
import { warn, loadGetInitialProps } from './utils'
import { makePublicRouterInstance } from './router'

export default class App extends Component {
  state = {
    hasError: null
  }

  static displayName = 'App'

  static async getInitialProps ({ Component, router, ctx }) {
    const pageProps = await loadGetInitialProps(Component, ctx)
    return {pageProps}
  }

  static childContextTypes = {
    _containerProps: PropTypes.any,
    headManager: PropTypes.object,
    router: PropTypes.object
  }

  getChildContext () {
    const { headManager } = this.props
    const {hasError} = this.state
    return {
      headManager,
      router: makePublicRouterInstance(this.props.router),
      _containerProps: {...this.props, hasError}
    }
  }

  componentDidCatch (error, info) {
    error.stack = `${error.stack}\n\n${info.componentStack}`
    window.next.renderError(error)
    this.setState({ hasError: true })
  }

  render () {
    const {router, Component, pageProps} = this.props
    const url = createUrl(router)
    return <Container>
      <Component url={url} {...pageProps} />
    </Container>
  }
}

export class Container extends Component {
  static contextTypes = {
    _containerProps: PropTypes.any
  }

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
    const { hasError } = this.context._containerProps

    if (hasError) {
      return null
    }

    const {children} = this.props

    if (process.env.NODE_ENV === 'production') {
      return <>{children}</>
    } else {
      const ErrorDebug = require('./error-debug').default
      const { AppContainer } = require('react-hot-loader')

      // includes AppContainer which bypasses shouldComponentUpdate method
      // https://github.com/gaearon/react-hot-loader/issues/442
      return (
        <AppContainer warnings={false} errorReporter={ErrorDebug}>
          {children}
        </AppContainer>
      )
    }
  }
}

export function createUrl (router) {
  return {
    get query () {
      warn(`Warning: 'url.query' is deprecated. https://err.sh/next.js/url-deprecated`)
      return router.query
    },
    get pathname () {
      warn(`Warning: 'url.pathname' is deprecated. https://err.sh/next.js/url-deprecated`)
      return router.pathname
    },
    get asPath () {
      warn(`Warning: 'url.asPath' is deprecated. https://err.sh/next.js/url-deprecated`)
      return router.asPath
    },
    back: () => {
      warn(`Warning: 'url.back()' is deprecated. Use "window.history.back()" https://err.sh/next.js/url-deprecated`)
      router.back()
    },
    push: (url, as) => {
      warn(`Warning: 'url.push()' is deprecated. Use "next/router" APIs. https://err.sh/next.js/url-deprecated`)
      return router.push(url, as)
    },
    pushTo: (href, as) => {
      warn(`Warning: 'url.pushTo()' is deprecated. Use "next/router" APIs. https://err.sh/next.js/url-deprecated`)
      const pushRoute = as ? href : null
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url, as) => {
      warn(`Warning: 'url.replace()' is deprecated. Use "next/router" APIs. https://err.sh/next.js/url-deprecated`)
      return router.replace(url, as)
    },
    replaceTo: (href, as) => {
      warn(`Warning: 'url.replaceTo()' is deprecated. Use "next/router" APIs. https://err.sh/next.js/url-deprecated`)
      const replaceRoute = as ? href : null
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    }
  }
}
